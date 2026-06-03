# ESP32-DIV Dual-Boot (16MB Flash)

## Voraussetzung
```bash
esptool.py --chip esp32s3 --port /dev/ttyACM0 flash_id
```
Muss `16MB` anzeigen.

## Layout
```
0x000000 — 0x010000  Bootloader + Partition Table + NVS + OTADATA
0x010000 — 0x090000  Factory: Boot-Menü (512KB)
0x090000 — 0x270000  OTA_0: CiferTech v1.6.0 (1.875MB)
0x270000 — 0x670000  OTA_1: Bruce FULL (4MB)
0x670000 — 0x1000000 Spiffs: ~9.5MB
```

## Boot-Menü
Beim Start erscheint ein Auswahlmenü auf dem Display:
- **CiferTech Original** ← default (autoboot nach 10s)
- **Bruce Full**

Navigation: UP/DOWN zum Auswählen, SELECT zum Booten.
Nach 10s ohne Eingabe → CiferTech.

## Build
```bash
# Boot-Menü
cd /tmp/esp32-div-dualboot
pio run --environment esp32-dualboot

# Bruce
cd /tmp/bruce-esp32-div
pio run --environment esp32-div
```

## Alles flashen
```bash
esptool.py --chip esp32s3 --port /dev/ttyACM0 --baud 921600 \
  write_flash --flash_size 16MB \
  0x0000   bootloader.bin \
  0x8000   partitions.bin \
  0xE000   boot_app0.bin \
  0x10000  boot-menu.bin \
  0x90000  cifertech-v1.6.0.bin \
  0x270000 Bruce-esp32-div.bin
```

## Binaries
| Datei | Größe | Beschreibung |
|-------|-------|-------------|
| boot-menu.bin | 341KB | Boot-Menü (Factory) |
| cifertech-v1.6.0.bin | 1.6MB | CiferTech Original |
| Bruce-esp32-div.bin | 3.5MB | Bruce Full |
