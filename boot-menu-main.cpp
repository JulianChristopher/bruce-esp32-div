/**
 * ESP32-DIV Boot Menu
 * Arduino-basiert, nutzt SPI + Wire für ILI9341 + PCF8574.
 *
 * Anzeige: "1. CiferTech Original" (default, 10s Timeout)
 *          "2. Bruce Full"
 * Navigation: UP/DOWN, SELECT = booten
 */

#include <Arduino.h>
#include <SPI.h>
#include <Wire.h>
#include <esp_ota_ops.h>
#include <esp_partition.h>

/* ─── Pins ─── */
#define TFT_MOSI  35
#define TFT_MISO  37
#define TFT_SCLK  36
#define TFT_CS    17
#define TFT_DC    16
#define TFT_RST   0
#define TFT_BL    7

#define PCF_ADDR  0x20

/* PCF8574 bits (active LOW) */
#define BTN_UP     (1<<7)
#define BTN_SEL    (1<<6)
#define BTN_DOWN   (1<<5)
#define BTN_RIGHT  (1<<4)
#define BTN_LEFT   (1<<3)

/* ═══ ILI9341 Low-Level ═══ */
static void wr8(uint8_t b) { SPI.transfer(b); }

static void cmd(uint8_t c) {
    digitalWrite(TFT_DC, LOW);
    wr8(c);
}

static void data(uint8_t d) {
    digitalWrite(TFT_DC, HIGH);
    wr8(d);
}

static void setWindow(uint16_t x1, uint16_t y1, uint16_t x2, uint16_t y2) {
    cmd(0x2A); data(x1>>8); data(x1); data(x2>>8); data(x2);
    cmd(0x2B); data(y1>>8); data(y1); data(y2>>8); data(y2);
    cmd(0x2C);
}

static void fillRect(int x1, int y1, int x2, int y2, uint16_t c) {
    setWindow(x1, y1, x2, y2);
    digitalWrite(TFT_DC, HIGH);
    uint32_t n = (uint32_t)(x2-x1+1)*(y2-y1+1);
    for (uint32_t i = 0; i < n; i++) {
        wr8(c>>8); wr8(c&0xFF);
    }
}

static void fillScreen(uint16_t c) { fillRect(0,0,239,319,c); }

#define RGB(r,g,b) ((uint16_t)(((r>>3)<<11)|((g>>2)<<5)|(b>>3)))
#define COL_BG   RGB(10,10,30)
#define COL_FG   RGB(200,200,200)
#define COL_HL   RGB(255,180,0)
#define COL_DIM  RGB(90,90,90)
#define COL_TTL  RGB(255,200,50)

/* ═══ Display Init ═══ */
static void dispInit() {
    pinMode(TFT_RST, OUTPUT);
    pinMode(TFT_CS, OUTPUT);
    pinMode(TFT_DC, OUTPUT);
    pinMode(TFT_BL, OUTPUT);
    digitalWrite(TFT_CS, HIGH);

    /* Reset */
    digitalWrite(TFT_RST, HIGH); delay(5);
    digitalWrite(TFT_RST, LOW);  delay(5);
    digitalWrite(TFT_RST, HIGH); delay(120);

    /* SPI for display (Bus A: 36/35/37) */
    SPI.begin(TFT_SCLK, TFT_MISO, TFT_MOSI, TFT_CS);
    SPI.beginTransaction(SPISettings(27000000, MSBFIRST, SPI_MODE0));
    digitalWrite(TFT_CS, LOW);

    /* ILI9341 init */
    cmd(0x01); delay(120);
    cmd(0x11); delay(120);
    cmd(0x36); data(0x48);
    cmd(0x3A); data(0x55);
    cmd(0x21); // INVERSION ON
    cmd(0x13);
    cmd(0x29); delay(50);

    /* Backlight PWM */
    ledcAttach(TFT_BL, 5000, 8);
    ledcWrite(TFT_BL, 200);

    SPI.endTransaction();
    digitalWrite(TFT_CS, HIGH);
}

/* ═══ I²C / PCF8574 ═══ */
static uint8_t pcfRead() {
    Wire.requestFrom(PCF_ADDR, (uint8_t)1);
    if (Wire.available()) return Wire.read();
    return 0xFF;
}

/* ═══ Font 6x8 ═══ */
#include "font.h"

static void drawChar(int x, int y, char c, uint16_t fg, uint16_t bg) {
    int idx = c - 32;
    if (idx < 0 || idx >= 96) return;
    for (int row = 0; row < 8; row++) {
        uint8_t bits = font6x8[idx][row];
        for (int col = 0; col < 6; col++) {
            if (bits & (0x20 >> col))
                fillRect(x+col, y+row, x+col, y+row, fg);
        }
    }
}

static void drawStr(int x, int y, const char *s, uint16_t fg, uint16_t bg) {
    while (*s) {
        if (*s == ' ') {
            x += 7;
        } else if (*s >= 32 && *s <= 127) {
            drawChar(x, y, *s, fg, bg);
            x += 7;
        } else {
            x += 7;  /* unknown char */
        }
        s++;
    }
}

static int strWidth(const char *s) { return strlen(s) * 7; }

/* ═══ Boot ═══ */
static void bootPartition(int item) {
    esp_partition_subtype_t sub = (item == 0)
        ? ESP_PARTITION_SUBTYPE_APP_OTA_0
        : ESP_PARTITION_SUBTYPE_APP_OTA_1;
    const esp_partition_t *target = esp_partition_find_first(
        ESP_PARTITION_TYPE_APP, sub, NULL);
    if (target) esp_ota_set_boot_partition(target);
    esp_restart();
}

/* ═══ Setup ═══ */
void setup() {
    dispInit();

    Wire.begin(8, 9);

    fillScreen(COL_BG);

    int sel = 0;
    uint8_t prevPCF = 0xFF;
    unsigned long tStart = millis();

    while (1) {
        unsigned long elapsed = millis() - tStart;
        int sec = (10000 - (int)elapsed) / 1000;
        if (sec < 0) sec = 0;

        /* Read buttons */
        uint8_t pcf = pcfRead();
        uint8_t pressed = (~pcf) & 0xF8;
        uint8_t fresh = pressed & ~(~prevPCF & 0xF8);
        prevPCF = pcf;

        if (fresh & BTN_DOWN) { sel = 1; tStart = millis(); }
        if (fresh & BTN_UP)   { sel = 0; tStart = millis(); }
        if (fresh & BTN_SEL)  bootPartition(sel);
        if (fresh & BTN_LEFT) bootPartition(sel);
        if (fresh & BTN_RIGHT) bootPartition(sel);

        /* Draw */
        fillScreen(COL_BG);

        drawStr(20, 20, "ESP32-DIV Boot Menu", COL_TTL, COL_BG);
        drawStr(20, 30, "====================", COL_DIM, COL_BG);

        const char *items[] = { "CiferTech Original", "Bruce Full" };
        for (int i = 0; i < 2; i++) {
            int yy = 70 + i * 25;
            uint16_t c = (i == sel) ? COL_HL : COL_FG;
            drawStr(25, yy, items[i], c, COL_BG);
            if (i == sel) drawStr(185, yy, "<--", COL_HL, COL_BG);
        }

        char buf[32];
        snprintf(buf, 32, "Auto-boot in %ds", sec);
        drawStr(20, 150, buf, COL_DIM, COL_BG);

        drawStr(20, 240, "UP/DOWN: select", COL_DIM, COL_BG);
        drawStr(20, 250, "SELECT/LEFT/RIGHT: boot", COL_DIM, COL_BG);
        drawStr(20, 270, "Flash: 16MB", COL_DIM, COL_BG);
        drawStr(20, 280, "Firmware: 2 slots", COL_DIM, COL_BG);

        if (sec <= 0) bootPartition(0);

        delay(100);
    }
}

void loop() { delay(1000); }
