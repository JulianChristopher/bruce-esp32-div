#include "core/powerSave.h"
#include "core/utils.h"
#include <Wire.h>

/***************************************************************************************
** PCF8574 I²C I/O Expander — Button input
** Address: 0x20
** Pin map:  P3=LEFT, P4=RIGHT, P5=DOWN, P6=SELECT, P7=UP
** Active:   LOW = pressed (internal pull-up)
***************************************************************************************/
#define PCF8574_ADDR    0x20

static uint8_t pcf_read(void) {
    Wire.requestFrom((uint8_t)PCF8574_ADDR, (uint8_t)1);
    if (Wire.available()) return Wire.read();
    return 0xFF;  // bus error → assume nothing pressed
}

/*─ Button-to-PCF8574-bit mapping ──────────────────────*/
#define PCF_BIT_UP      7
#define PCF_BIT_SELECT  6
#define PCF_BIT_DOWN    5
#define PCF_BIT_RIGHT   4
#define PCF_BIT_LEFT    3

/*─ Debounce / repeat timings (ms) ──────────────────*/
#ifndef DEBOUNCE_MS
#define DEBOUNCE_MS      40
#endif
#ifndef LONG_PRESS_MS
#define LONG_PRESS_MS    800
#endif
#ifndef REPEAT_SCROLL_MS
#define REPEAT_SCROLL_MS 120
#endif

/*────────────────── Power / battery ────────────────────*/
/* No battery ADC populated on this board */
int getBattery() { return 0; }
bool isCharging() { return false; }

/***************************************************************************************
** _setup_gpio()
***************************************************************************************/
void _setup_gpio() {
    /* Backlight GPIO7 — LEDC PWM (ESP32-S3 LEDC: 6 timers, 8 channels)
       Channel 0 on GPIO7 is valid and not shared with other peripherals. */
    pinMode(7, OUTPUT);
    ledcAttachChannel(7, 5000, 8, 0);  // 5 kHz, 8-bit, channel 0

    /* I²C for PCF8574 at 0x20 (SDA=8, SCL=9)
       ⚠️  PCF8574 requires external pull-up resistors (4.7 kΩ typ) on SDA/SCL.
       Internal ESP32-S3 pull-ups (~45 kΩ) are too weak for reliable I²C at 100 kHz.
       Ensure external pull-ups are populated on the PCB. */
    Wire.begin(8, 9);

    /* SPI Bus B (VSPI/FSPI) — shared by SD, CC1101, NRF24×3, PN532 */
    SPI.begin(SDCARD_SCK, SDCARD_MISO, SDCARD_MOSI, SDCARD_CS);  // 12, 13, 11, 10

    /* Drive all radio / peripheral CS lines high so they stay deselected at boot */
    pinMode(CC1101_SS_PIN, OUTPUT);  // GPIO5
    pinMode(NRF24_SS_PIN, OUTPUT);   // GPIO48 (NRF24 module #2, CSN=48)
    pinMode(SDCARD_CS, OUTPUT);      // GPIO10
    pinMode(PN532_SS, OUTPUT);       // GPIO4
    digitalWrite(CC1101_SS_PIN, HIGH);
    digitalWrite(NRF24_SS_PIN, HIGH);
    digitalWrite(SDCARD_CS, HIGH);
    digitalWrite(PN532_SS, HIGH);

    /* NRF24 CE pins — drive LOW (standby); nrf_start() will re-init as needed */
    pinMode(15, OUTPUT);              // NRF24 #1 CE
    pinMode(47, OUTPUT);              // NRF24 #2 CE (active module)
    pinMode(14, OUTPUT);              // NRF24 #3 CE
    digitalWrite(15, LOW);
    digitalWrite(47, LOW);
    digitalWrite(14, LOW);
}

/*********************************************************************
** _post_setup_gpio()
**********************************************************************/
void _post_setup_gpio() {
    /* Force CC1101 as RF module — default rfTx/rfRx use GROVE_SDA/SCL (GPIO8/9) which
       would short the I²C bus used by the PCF8574 input expander. */
    bruceConfigPins.rfModule = CC1101_SPI_MODULE;
    bruceConfigPins.rfTx     = 6;   // CC1101 GDO0
    bruceConfigPins.rfRx     = 3;   // CC1101 GDO2

    /* IR pins — default IR_RX pins may collide with I²C */
    bruceConfigPins.irTx     = 14;
    bruceConfigPins.irRx     = 21;

#if defined(USE_TFT_eSPI_TOUCH)
    /* Use predefined calibration from .ini — skip runtime calibration to
       avoid hanging if touch isn't responding during first boot. */
    pinMode(TOUCH_CS, OUTPUT);
    uint16_t calData[5] = {
        TOUCH_X_MIN, TOUCH_X_MAX, TOUCH_Y_MIN, TOUCH_Y_MAX, (uint16_t)(TOUCH_X_MIN + TOUCH_X_MAX) / 2
    };
    tft.setTouch(calData);
#endif
}

/*********************************************************************
** _setBrightness()
** Backlight on GPIO7, LEDC PWM channel 0
**********************************************************************/
void _setBrightness(uint8_t brightval) {
    /* Bruce sends 0-100; MINBRIGHT may push the floor up */
    if (brightval == 0) {
        ledcWrite(0, 0);
    } else {
        int bl = MINBRIGHT + round(((255 - MINBRIGHT) * brightval / 100));
        if (bl > 255) bl = 255;
        ledcWrite(0, bl);
    }
}

/*********************************************************************
** InputHandler()
** Reads PCF8574 at 0x20 + polls XPT2046 touchscreen.
**********************************************************************/
void InputHandler(void) {
    checkPowerSaveTime();

    /* ── Touch via TFT_eSPI (USE_TFT_eSPI_TOUCH) ── */
#if defined(USE_TFT_eSPI_TOUCH)
    static unsigned long touchTimer = 0;
    if (millis() - touchTimer > 200 || LongPress) {
        touchTimer = millis();
        TouchPoint t;
        bool touched = tft.getTouch(&t.x, &t.y);
        if (touched) {
            /* Rotation-aware coordinate transform */
            if (bruceConfigPins.rotation == 3) {
                t.y = (tftHeight + 20) - t.y;
                t.x = tftWidth - t.x;
            }
            if (bruceConfigPins.rotation == 0) {
                int tmp = t.x;
                t.x = tftWidth - t.y;
                t.y = tmp;
            }
            if (bruceConfigPins.rotation == 2) {
                int tmp = t.x;
                t.x = t.y;
                t.y = (tftHeight + 20) - tmp;
            }

            if (!wakeUpScreen()) {
                AnyKeyPress = true;
                touchPoint.x = t.x;
                touchPoint.y = t.y;
                touchPoint.pressed = true;
                touchHeatMap(touchPoint);
            }
            return;  // touch handled, skip button poll this cycle
        }
    }
#endif /* USE_TFT_eSPI_TOUCH */

    /* ── PCF8574 Buttons ── */
    static uint8_t  prevReg   = 0xFF;
    static unsigned long lastEvent = 0;
    static unsigned long lastRepeat = 0;
    static bool         repeated     = false;

    unsigned long now = millis();
    uint8_t reg = pcf_read();

    bool pressedUp    = !(reg & (1 << PCF_BIT_UP));
    bool pressedDown  = !(reg & (1 << PCF_BIT_DOWN));
    bool pressedLeft  = !(reg & (1 << PCF_BIT_LEFT));
    bool pressedRight = !(reg & (1 << PCF_BIT_RIGHT));
    bool pressedSel   = !(reg & (1 << PCF_BIT_SELECT));
    bool any = pressedUp | pressedDown | pressedLeft | pressedRight | pressedSel;

    if (any) {
        if (!wakeUpScreen()) AnyKeyPress = true;
        else return;
    }

    /* Edge detection */
    uint8_t pressedBits = (~reg) & 0xF8;
    uint8_t wasPressed  = (~prevReg) & 0xF8;
    uint8_t freshBits   = pressedBits & ~wasPressed;
    prevReg = reg;

    bool freshLeft  = freshBits & (1 << PCF_BIT_LEFT);
    bool freshRight = freshBits & (1 << PCF_BIT_RIGHT);
    bool freshUp    = freshBits & (1 << PCF_BIT_UP);
    bool freshDown  = freshBits & (1 << PCF_BIT_DOWN);
    bool freshSel   = freshBits & (1 << PCF_BIT_SELECT);

    if (now - lastEvent < DEBOUNCE_MS) {
        if (!repeated || now - lastRepeat < REPEAT_SCROLL_MS) return;
    }

    bool didAction = false;

    if (freshLeft)  { PrevPress = true; EscPress = true; didAction = true; }
    if (freshRight) { NextPress = true; didAction = true; }
    if (freshSel)   { SelPress  = true; didAction = true; }

    if (freshUp || (pressedUp && repeated && now - lastRepeat >= REPEAT_SCROLL_MS)) {
        UpPress       = true;
        PrevPagePress = true;
        didAction     = true;
    }
    if (freshDown || (pressedDown && repeated && now - lastRepeat >= REPEAT_SCROLL_MS)) {
        DownPress      = true;
        NextPagePress  = true;
        didAction      = true;
    }

    if (didAction) lastEvent = now;

    bool held = pressedUp | pressedDown;
    if (held && lastEvent > 0 && now - lastEvent >= LONG_PRESS_MS) {
        repeated   = true;
        lastRepeat = now;
    } else if (!held) {
        repeated = false;
    }
}

/*********************************************************************
** powerOff()
**********************************************************************/
void powerOff() {
    /* No PMU on this board — just sleep */
    esp_sleep_enable_ext0_wakeup((gpio_num_t)GPIO_NUM_NC, LOW);
    esp_deep_sleep_start();
}

/*********************************************************************
** checkReboot()
** Hold LEFT+RIGHT for 3 seconds to power off.
**********************************************************************/
void checkReboot() {
    uint8_t reg = pcf_read();
    bool pressedLeft  = !(reg & (1 << PCF_BIT_LEFT));
    bool pressedRight = !(reg & (1 << PCF_BIT_RIGHT));

    if (pressedLeft && pressedRight) {
        uint32_t start = millis();
        while (pressedLeft && pressedRight) {
            if (millis() - start > 500) {
                int countDown = (millis() - start) / 1000 + 1;
                tft.setTextSize(1);
                tft.setTextColor(bruceConfig.priColor, bruceConfig.bgColor);
                if (countDown < 4) {
                    tft.drawCentreString("PWR OFF IN " + String(countDown) + "/3",
                                          tftWidth / 2, 12, 1);
                } else {
                    tft.fillScreen(bruceConfig.bgColor);
                    powerOff();
                }
                delay(10);
            }
            /* re-read so we break when released */
            reg = pcf_read();
            pressedLeft  = !(reg & (1 << PCF_BIT_LEFT));
            pressedRight = !(reg & (1 << PCF_BIT_RIGHT));
        }
        delay(30);
        tft.fillRect(60, 12, tftWidth - 60, tft.fontHeight(1), bruceConfig.bgColor);
    }
}

