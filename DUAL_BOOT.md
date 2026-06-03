# Dual-Boot: CiferTech + Bruce auf ESP32-DIV v2 (4MB Flash)

## Board
- **Board:** ESP32-DIV v2 (CiferTech) — custom ESP32-S3 mit 4MB DIO Flash
- **Chip:** ESP32-S3 (Xtensa LX7 dual-core 240MHz, 320KB SRAM)
- **Flash:** 4MB DIO QSPI @ 80MHz

---

## 1. CiferTech Original Firmware

**Repo:** https://github.com/cifertech/ESP32-DIV

### Quellcode
```
979.226 Bytes total (24 × .cpp + .h + .ino)
```

### Pre-compiled Binary
| Version | Größe | Letztes Datum |
|---------|-------|---------------|
| v1.6.0  | 1.616.272 Bytes (1,541 MB) | 0x18A98F |

### Flash-Layout (partition table)
CiferTech verwendet **bereits eine Dual-OTA-Partitionstabelle** auf 4MB:

```
# Name,     Type, SubType, Offset,   Size
nvs,        data, nvs,     0x9000,   0x5000   (20 KB)
otadata,    data, ota,     0xE000,   0x2000   (8 KB)
app0,       app,  ota_0,   0x10000,  0x1E0000 (1.875 MB)
app1,       app,  ota_1,   0x1F0000, 0x1E0000 (1.875 MB)
spiffs,     data, spiffs,  0x3D0000, 0x20000  (128 KB)
coredump,   data, coredump,0x3F0000, 0x10000  (64 KB)
```

**Fazit:** CiferTech v1.6.0 passt problemlos in app0 (0x1E0000 / 1.875 MB).
Tatsächlicher Bedarf: **~1,55 MB** (0x17B000).

---

## 2. Bruce Firmware (Fork)

**Repo:** https://github.com/JulianChristopher/bruce-esp32-div

### Board-Definition: `boards/esp32-div/esp32-div.ini`
- Verwendet `board_build.partitions = custom_4Mb_full.csv`
- Extends `${env_4mb.build_flags}` (= IR-Einschränkungen, keine LITE_VERSION)

### Partitions-Dateien im Bruce-Root

| Datei | Layout | Zweck |
|-------|--------|-------|
| `custom_4Mb.csv` | app0=0x270000 (2,44 MB), spiffs=0x180000 (1,5 MB) | Single-App 4MB |
| `custom_4Mb_full.csv` | app0=0x3C0000 (3,75 MB), spiffs=0x30000 (192 KB) | **Full 4MB** (aktuell für esp32-div) |
| `custom_8Mb.csv` | app0=0x4E0000 (4,875 MB), spiffs=0x300000 (3 MB) | 8MB Flash |
| `custom_16Mb.csv` | app0=0x470000 (4,44 MB), spiffs=0xB70000 (11,4 MB) | 16MB Flash |

### Bruce FULL (aktueller esp32-div Build)
- Partition: **0x3C0000** (3,75 MB) via `custom_4Mb_full.csv`
- Geschätzte App-Größe: **~3,3–3,6 MB** (vergleichbar Upstream Bruce CYD-Builds)
- → Zu groß für irgendein Dual-Boot-Layout auf 4MB

### Bruce LITE (= LITE_VERSION=1)

Die `[env_light]`-Sektion in `platformio.ini` definiert den LITE-Build:

```ini
[env_light]
build_flags =
    -DLITE_VERSION=1
    -D_IR_ENABLE_DEFAULT_=false
    # Nur NEC, Samsung, RC5, RC6, LG, Sony, Panasonic, RAW
lib_deps =                      # Strip Hardware-Abhängigkeiten:
    # - WireGuard               # Kein VPN
    # - LibSSH-ESP32            # Kein SSH
    # - ESP-Amiibolink          # Kein Amiibolink
    # - ESP-PN532BLE            # Kein BLE PN532
    # - ESP-PN532-UART          # Kein UART PN532
    # - ESP-PN532Killer         # Kein PN532Killer
    # - ESP8266Audio            # Kein Audio
    # - ESP8266SAM              # Kein SAM (Sprachsynthese)
    # - mquickjs                # Kein JavaScript-Interpreter
    # - OneWire                 # Kein OneWire
    # - AnimatedGIF             # Kein GIF-Support
    # - PNGdec                  # Kein PNG-Decoder
    # - FastLED                 # Keine LEDs
```

#### Vergleich: Bruce FULL vs LITE (Upstream v1.15)

| Build | Merged Binary | App-Anteil (geschätzt) |
|-------|--------------|----------------------|
| FULL (CYD-2432S028) | 3.488.176 B (3,33 MB) | ~3,27 MB |
| LAUNCHER/LITE (CYD-2432S028) | 2.389.280 B (2,28 MB) | **~2,21 MB** |
| core4mb (m5stack-core4mb) | 2.552.512 B (2,43 MB) | ~2,37 MB |

**LITE-Ersparnis:** ~1 MB gegenüber FULL.

#### Kernproblem: Bruce LITE passt NICHT in 1,875 MB

```
Bruce LITE App:      ~2.319.136 Bytes (~2,21 MB)
CiferTech app-Slot:   1.966.080 Bytes (~1,875 MB)
Differenz:             ~353.056 Bytes (zu groß)
```

---

## 3. Dual-Boot Partition Table (4MB)

### Ansatz: Asymmetrische Partitionen

Da CiferTech nur ~1,55 MB braucht und Bruce LITE ~2,21 MB, wird die Partition asymmetrisch:

```
4MB Flash = 0x400000 Bytes

Bootloader:     0x000000 - 0x008000 (32 KB, ESP32-S3)
Partition Table: 0x008000 - 0x009000 (4 KB)
nvs:             0x009000 - 0x00D000 (16 KB)
otadata:         0x00D000 - 0x00F000 (8 KB)
                 0x00F000 - 0x010000 (4 KB Padding)

app0 (CiferTech): 0x010000 - 0x1B0000 (0x1A0000 = 1,625 MB)
app1 (Bruce LITE): 0x1B0000 - 0x400000 (0x250000 = 2,32 MB)
```

### Partition Math

| Region | Offset | Size | Nutzbar |
|--------|--------|------|---------|
| Bootloader | 0x0 | 0x8000 | — |
| Partition Table | 0x8000 | 0x1000 | — |
| nvs | 0x9000 | 0x4000 | Einstellungen |
| otadata | 0xD000 | 0x2000 | OTA-Boot-Info |
| **app0 (CiferTech)** | **0x10000** | **0x1A0000** | **1.703.936 B (1,625 MB)** |
| **app1 (Bruce LITE)** | **0x1B0000** | **0x250000** | **2.424.832 B (2,32 MB)** |
| **Gesamt** | | **0x400000** | **4 MB** ✅ |

**Keine SPIFFS-Partition** – beide Firmwares müssen ohne SPIFFS/Dateisystem auskommen.
- CiferTech braucht kein SPIFFS (es nutzt SD-Karte für Ducky-Scripts)
- Bruce LITE braucht LittleFS für Web-UI → dieses Feature muss deaktiviert werden

---

## 4. Datei: `custom_4mb_dual.csv`

```csv
# ESP32-DIV Dual-Boot (4MB): CiferTech (app0) + Bruce LITE (app1)
# Asymmetrisch: CiferTech 1,625 MB, Bruce 2,32 MB
# Kein SPIFFS/LittleFS (beide Firmwares ohne Dateisystem)
# Name,     Type, SubType, Offset,   Size,     Flags
nvs,        data, nvs,     0x9000,   0x4000,
otadata,    data, ota,     0xD000,   0x2000,
app0,       app,  ota_0,   0x10000,  0x1A0000,
app1,       app,  ota_1,   0x1B0000, 0x250000,
```

**⚠️ Wichtig:** Bruce muss **ohne LittleFS-Kompilierung** gebaut werden, d.h.:
- `board_build.filesystem` auf `""` setzen (kein LittleFS/SPIFFS)
- WebUI-Features deaktivieren, die auf Dateisystem angewiesen sind
- In der platformio.ini: `board_build.filesystem =`

---

## 5. Boot-Selection via GPIO0

### Hardware-Methode (Boot-Button)

Der ESP32-S3 liest **GPIO0** beim Booten aus:
- **GPIO0 = HIGH** (nicht gedrückt) → Boote **CiferTech** (app0 / ota_0)
- **GPIO0 = LOW** (gedrückt/verbunden mit GND) → Boote **Bruce LITE** (app1 / ota_1)

### Implementierung

Die Boot-Selection wird über `esp_ota_set_boot_partition()` realisiert.
Im Boot-Check (setup/early init) wird GPIO0 gelesen:

```cpp
// Boot-Selection via GPIO0
// Einbindung in die erste setup()-Phase beider Firmwares
#include "esp_log.h"
#include "esp_ota_ops.h"
#include "driver/gpio.h"

void checkBootButton() {
    gpio_set_direction(GPIO_NUM_0, GPIO_MODE_INPUT);
    gpio_set_pull_mode(GPIO_NUM_0, GPIO_PULLUP_ONLY);
    
    // Kurz warten, damit GPIO0 stabil ist
    vTaskDelay(pdMS_TO_TICKS(50));
    
    int btn_state = gpio_get_level(GPIO_NUM_0);
    
    if (btn_state == 0) {
        // GPIO0 = LOW → Boot-Button gedrückt → zu Bruce (ota_1) wechseln
        const esp_partition_t *target = esp_partition_find_first(
            ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_1, NULL);
        if (target) {
            esp_ota_set_boot_partition(target);
            ESP_LOGI("BOOT", "Switching to Bruce (ota_1), restarting...");
            esp_restart();
        }
    }
    // GPIO0 = HIGH → CiferTech (ota_0) booten → nichts tun
}
```

### Boot-Ablauf

```
ESP32-S3 Power-On / Reset
          │
          ▼
    BootROM → Bootloader → Partition Table
          │
          ▼
    otadata check: welche Partition?
          │
     ┌────┴────┐
     ▼         ▼
  app0      app1
(CiferTech) (Bruce LITE)
     │         │
     ▼         ▼
  setup():  setup():
  GPIO0     GPIO0
  check?    check?
     │         │
  LOW→app1  LOW→app0
  HIGH→stay HIGH→stay
```

### Manuelles Boot-Override

Möchte man nach dem Booten umschalten (z. B. aus dem Menü heraus):

```cpp
#include "esp_ota_ops.h"

void switchToOtherFirmware() {
    const esp_partition_t *current = esp_ota_get_running_partition();
    esp_partition_subtype_t target_subtype;
    
    if (current->subtype == ESP_PARTITION_SUBTYPE_APP_OTA_0) {
        target_subtype = ESP_PARTITION_SUBTYPE_APP_OTA_1;
    } else {
        target_subtype = ESP_PARTITION_SUBTYPE_APP_OTA_0;
    }
    
    const esp_partition_t *target = esp_partition_find_first(
        ESP_PARTITION_TYPE_APP, target_subtype, NULL);
    
    if (target && target != current) {
        esp_ota_set_boot_partition(target);
        ESP_LOGI("BOOT", "Switching to %s, restarting...",
                 target_subtype == ESP_PARTITION_SUBTYPE_APP_OTA_1 ? 
                 "Bruce" : "CiferTech");
        esp_restart();
    }
}
```

---

## 6. Flash-Befehle (esptool.py)

### Voraussetzungen

```bash
pip install esptool
```

### Flash-Konfiguration

- **Chip:** esp32s3
- **Flash-Mode:** dio
- **Flash-Freq:** 80m
- **Flash-Size:** 4MB

### Bootloader/Partitionstabelle (einmalig)

Diese Binaries werden einmalig geflasht und gelten für beide Firmwares:

```bash
# ESP32-S3 Bootloader (von CiferTech oder Arduino-ESP32 Build)
esptool.py --chip esp32s3 --port /dev/ttyUSB0 --baud 921600 \
    write_flash -z \
    --flash_mode dio --flash_freq 80m --flash_size 4MB \
    0x0000 bootloader.bin \
    0x8000 custom_4mb_dual.bin \
    0xE000 boot_app0.bin
```

### CiferTech in app0 (ota_0)

```bash
esptool.py --chip esp32s3 --port /dev/ttyUSB0 --baud 921600 \
    write_flash -z \
    --flash_mode dio --flash_freq 80m --flash_size 4MB \
    0x10000 ESP32-DIV-v1.6.0.bin
```

### Bruce LITE in app1 (ota_1)

```bash
esptool.py --chip esp32s3 --port /dev/ttyUSB0 --baud 921600 \
    write_flash -z \
    --flash_mode dio --flash_freq 80m --flash_size 4MB \
    0x1B0000 Bruce-esp32-div-lite.bin
```

### Alles auf einmal (vollständiger Flash)

```bash
esptool.py --chip esp32s3 --port /dev/ttyUSB0 --baud 921600 \
    write_flash -z \
    --flash_mode dio --flash_freq 80m --flash_size 4MB \
    0x0000    bootloader.bin \
    0x8000    custom_4mb_dual.bin \
    0xE000    boot_app0.bin \
    0x10000   ESP32-DIV-v1.6.0.bin \
    0x1B0000  Bruce-esp32-div-lite.bin
```

### OTA Boot-Partition setzen

Nach dem Flash muss die Boot-Partition gesetzt werden:

```bash
# Standard: CiferTech booten (app0 / ota_0)
esptool.py --chip esp32s3 --port /dev/ttyUSB0 --baud 921600 \
    write_flash 0xD000 otadata_cifertech.bin

# Für Bruce (app1 / ota_1):
esptool.py --chip esp32s3 --port /dev/ttyUSB0 --baud 921600 \
    write_flash 0xD000 otadata_bruce.bin
```

**Alternative (kompakter):** `esptool.py erase_region 0xD000 0x2000` löscht die otadata,
dann bootet der ESP32-S3 standardmäßig das erste gültige Image (ota_0 = CiferTech).

### otadata Binary erzeugen

```bash
# Python-Script für otadata:
python3 -c "
import struct, sys
# OTA data structure (ESP-IDF)
data = bytearray(0x2000)
# Set ota_0 as boot partition
struct.pack_into('<II', data, 0, 1, 0)  # seq=1, crc=0
crc = 0
for b in data[:2044]:
    crc ^= b
struct.pack_into('<I', data, 2044, crc)
sys.stdout.buffer.write(data[:2048])
# Repeat for second sector
sys.stdout.buffer.write(data[:2048])
" > otadata_cifertech.bin
```

---

## 7. Bruce LITE für Dual-Boot bauen

### Build-Env einrichten

In `platformio.ini` folgenden Eintrag hinzufügen:

```ini
[env:esp32-div-lite-prebuild]
board = esp32-div
board_build.arduino.memory_type = dio_qspi
board_build.partitions = custom_4mb_dual.csv
board_build.filesystem =                ; KEIN Dateisystem!
build_src_filter = ${env.build_src_filter} +<boards/esp32-div>
build_flags =
    ${env.build_flags}
    ${env_light.build_flags}
    -DCORE_DEBUG_LEVEL=0
    ; Alle Board-spezifischen Flags von esp32-div.ini kopieren
    -DHAS_SCREEN=1 -DHAS_TOUCH=1
    -DUSER_SETUP_LOADED=1 -DILI9341_DRIVER=1
    -DTFT_WIDTH=240 -DTFT_HEIGHT=320
    -DTFT_MISO=37 -DTFT_MOSI=35 -DTFT_SCLK=36
    -DTFT_CS=17 -DTFT_DC=16 -DTFT_RST=0
    -DTFT_BACKLIGHT_ON=HIGH -DUSE_HSPI_PORT=1
    -DSMOOTH_FONT=1 -DSPI_FREQUENCY=27000000
    -DTOUCH_CS=18 -DUSE_TFT_eSPI_TOUCH=1
    -DBACKLIGHT=7 -DTFT_BL=7
    -DSDCARD_CS=10 -DSDCARD_MOSI=11
    -DSDCARD_MISO=13 -DSDCARD_SCK=12 -DSDCARD_CD=38
    -DUSE_CC1101_VIA_SPI -DCC1101_SS_PIN=5
    -DCC1101_GDO0_PIN=6 -DCC1101_GDO2_PIN=3
    -DFEATURE_SUBGHZ_TOOLS=1
    -DUSE_NRF24_VIA_SPI -DNRF24_CE_PIN=47 -DNRF24_SS_PIN=48
    -DPN532_SS=4
    -DIR_TX_PINS='{{\"GPIO 14\", 14}}'
    -DIR_RX_PINS='{{\"GPIO 21\", 21}}'
    -DGROVE_SDA=8 -DGROVE_SCL=9
    -DDEVICE_NAME='\"ESP32-DIV v2\"'

lib_deps =
    ${env_light.lib_deps}
```

### Bauen

```bash
cd /pfad/zu/bruce-esp32-div
pio run --environment esp32-div-lite-prebuild
```

Die firmware.bin liegt dann in `.pio/build/esp32-div-lite-prebuild/firmware.bin`.

### Größenkontrolle

```bash
ls -lh .pio/build/esp32-div-lite-prebuild/firmware.bin
```

Die App muss **≤ 0x250000 Bytes** sein (2.424.832 Bytes = 2,32 MB).

---

## 8. Risiken & Einschränkungen

| Risiko | Beschreibung | Mitigation |
|--------|--------------|------------|
| **Bruce LITE zu groß** | LITE-Build könnte >0x250000 sein | Features weiter strippen (JS, BLE, GPS) |
| **Kein Dateisystem** | Bruce WebUI + LittleFS nicht verfügbar | Features deaktivieren, SD-Karte nutzen |
| **Keine OTA-Updates** | OTA-Empfänger auf beiden Seiten nötig | Nur manuelles Flashen via USB |
| **SPIFFS-Fragmentierung** | Beide Firmwares teilen kein Dateisystem | Jede FW nutzt SD-Karte oder NVS |
| **GPIO0 Konflikt** | Manche Boards nutzen GPIO0 für andere Zwecke | Prüfen ob GPIO0 frei ist |

---

## 9. Optimierungsmöglichkeiten

### Falls Bruce LITE noch zu groß ist

1. **GPS deaktivieren:** `-DNO_GPS=1` (größter Einzelsparer, da gps.cpp 100KB+)
2. **TFT_eSPI Fonts reduzieren:** Nur benötigte Fonts kompilieren
3. **IR-Protokolle minimieren:** `-D_IR_ENABLE_DEFAULT_=false` + nur NEC/Samsung
4. **Bluetooth-Features kappen:** `-DNO_BT=1`
5. **Flto (Link-Time Optimization):** Bereits aktiv (`-flto`)
6. **Debug-Symbole entfernen:** `-DCORE_DEBUG_LEVEL=0` (bereits gesetzt)
7. **Unused WiFi-Features:** WebServer, mDNS, HTTPClient deaktivieren

### Falls mehr als 4MB Flash verfügbar

| Flash | Layout |
|-------|--------|
| 8MB | app0=0x3E0000, app1=0x3E0000, spiffs=rest |
| 16MB | app0=0x470000, app1=0x470000, spiffs=rest |

---

## Zusammenfassung

```
┌──────────────────────────────────────────────────────┐
│  4MB Flash (0x400000)                                │
├──────────┬──────────┬───────────────────────────────┤
│ bootloader (32KB) + partition table (4KB) + nvs     │
│ + otadata (insgesamt ~64KB)                         │
├──────────┴──────────┴───────────────────────────────┤
│ app0 (ota_0): 0x10000 – 0x1B0000 (1,625 MB)         │
│ CiferTech v1.6.0 (~1.541 MB) ✓                      │
├─────────────────────────────────────────────────────┤
│ app1 (ota_1): 0x1B0000 – 0x400000 (2,32 MB)          │
│ Bruce LITE (~2,21 MB) ✓ (mit LITE_VERSION=1)        │
├─────────────────────────────────────────────────────┤
│ Boot-Selection: GPIO0 (Button) beim Einschalten      │
│ LOW  → Bruce (app1)  HIGH → CiferTech (app0)        │
└──────────────────────────────────────────────────────┘
```

**Stand:** 03.06.2026  
**Quellen:** CiferTech ESP32-DIV, bruce-esp32-div (Fork), Bruce Upstream v1.15
