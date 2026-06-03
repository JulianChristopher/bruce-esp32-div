#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

/*───────────────── Arduino API mapping ─────────────────*/
static const uint8_t TX = 43;
static const uint8_t RX = 44;

/* I²C (S3 defaults — PCF8574 expander lives here) */
static const uint8_t SDA = 8;
static const uint8_t SCL = 9;

/* SPI Bus B — shared by SD, CC1101, NRF24×3, PN532 */
static const uint8_t SS    = 10;   // SD_CS
static const uint8_t MOSI  = 11;   // SD_MOSI / CC1101_MOSI / NRF24_MOSI
static const uint8_t MISO  = 13;   // SD_MISO / CC1101_MISO / NRF24_MISO
static const uint8_t SCK   = 12;   // SD_SCLK / CC1101_SCK / NRF24_SCK

/* Analog / touch pads (mapped where usable on S3) */
static const uint8_t A0  = 1;
static const uint8_t A1  = 2;
static const uint8_t A2  = 3;
static const uint8_t A3  = 4;
static const uint8_t A4  = 5;
static const uint8_t A5  = 6;
static const uint8_t A6  = 7;
static const uint8_t A7  = 14;
static const uint8_t A8  = 15;
static const uint8_t A9  = 16;
static const uint8_t A10 = 17;
static const uint8_t A11 = 18;
static const uint8_t A12 = 21;

static const uint8_t T0 = 1;
static const uint8_t T1 = 2;
static const uint8_t T2 = 3;
static const uint8_t T3 = 4;
static const uint8_t T4 = 5;
static const uint8_t T5 = 6;
static const uint8_t T6 = 7;
static const uint8_t T7 = 14;
static const uint8_t T8 = 15;
static const uint8_t T9 = 16;
static const uint8_t T10 = 17;
static const uint8_t T11 = 18;
static const uint8_t T12 = 21;

/* No DAC on S3 */
// static const uint8_t DAC1 = …;
// static const uint8_t DAC2 = …;

/* Wake from deep-sleep — use touch-pad or ext0 */
#define DEEPSLEEP_WAKEUP_PIN -1  // no dedicated RTC GPIO button
#define DEEPSLEEP_PIN_ACT   LOW

#endif /* Pins_Arduino_h */
