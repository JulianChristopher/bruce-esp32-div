# Dual-Boot: CiferTech + Bruce auf ESP32-DIV v2 (16MB Flash)

## Voraussetzung: 16MB Flash prüfen

```bash
esptool.py --chip esp32s3 --port /dev/ttyACM0 flash_id
```
Wenn `flash size: 16MB` angezeigt wird, ist alles gut.

## Layout (16MB Flash)

```
0x000000 — 0x008000  Bootloader
0x008000 — 0x009000  Partition Table
0x009000 — 0x00D000  NVS
0x00D000 — 0x00F000  OTADATA
0x010000 — 0x020000  Factory: Boot-Selector (64KB)
0x020000 — 0x1C0000  OTA_0: CiferTech v1.6.0 (1.625MB)
0x1C0000 — 0x5C0000  OTA_1: Bruce FULL (4MB)
0x5C0000 — 0x1000000 Spiffs: ~10.25MB
```

## Alles flashen (einmalig)

```bash
# Config-Dateien
PARTITIONS=custom_16mb_dual.csv
BOOTLOADER=.pio/build/esp32-div/bootloader.bin
BOOT_APP0=.pio/build/esp32-div/boot_app0.bin
PARTITIONS_BIN=.pio/build/esp32-div/partitions.bin
FIRMWARE_BRUCE=.pio/build/esp32-div/firmware.bin
FIRMWARE_CIFER=../cifertech-v1.6.0.bin
BOOT_SELECTOR=.pio/build/esp32-div-dualboot/firmware.bin

# Schritt 1: Boot-Selector in Factory-Partition
esptool.py --chip esp32s3 --port /dev/ttyACM0 --baud 921600 \
  write_flash --flash_mode dio --flash_freq 80m --flash_size 16MB \
  0x0000  $BOOTLOADER \
  0x8000  $PARTITIONS_BIN \
  0xE000  $BOOT_APP0 \
  0x10000 $BOOT_SELECTOR

# Schritt 2: CiferTech in OTA_0
esptool.py --chip esp32s3 --port /dev/ttyACM0 --baud 921600 \
  write_flash --flash_mode dio --flash_freq 80m --flash_size 16MB \
  0x20000 $FIRMWARE_CIFER

# Schritt 3: Bruce FULL in OTA_1
esptool.py --chip esp32s3 --port /dev/ttyACM0 --baud 921600 \
  write_flash --flash_mode dio --flash_freq 80m --flash_size 16MB \
  0x1C0000 $FIRMWARE_BRUCE
```

## Boot-Verhalten

| GPIO0 | Bootet |
|-------|--------|
| **HIGH** (Default) | **Bruce FULL** (alle Features) |
| **LOW** (gedrückt) | **CiferTech Original** |

Der Boot-Selector läuft unsichtbar in < 1 Sekunde. Hältst du GPIO0 beim Einschalten, bootet CiferTech. Sonst Bruce.

## Dual-Boot aus Bruce heraus steuern

Füge einen Menüpunkt in Bruce hinzu:
```cpp
#include "esp_ota_ops.h"

void bootCiferTech() {
    auto *target = esp_partition_find_first(
        ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_0, NULL);
    if (target) {
        esp_ota_set_boot_partition(target);
        esp_restart();
    }
}
```

## Build-Befehle

```bash
# Boot-Selector bauen (im dualboot-Ordner)
cd /tmp/esp32-div-dualboot
pio run --environment esp32-div-dualboot

# Bruce FULL bauen (im bruce-esp32-div Ordner)
cd /tmp/bruce-esp32-div
pio run --environment esp32-div
```
