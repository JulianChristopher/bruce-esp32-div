# ESP32-DIV Triple-Boot (16MB Flash, Custom Bootloader)

## 🎯 Lösung: Custom ESP-IDF Bootloader mit Factory Reset

Der V4 Pro hat den ESP-IDF Bootloader MIT `CONFIG_BOOTLOADER_FACTORY_RESET` aus dem Quellcode gebaut.

### So funktioniert's:

| Aktion | Ergebnis |
|--------|---------|
| **Normal einschalten** | Bootloader bootet factory → **Boot-Menü erscheint auf Display** |
| **CiferTech wählen** | Boot-Menü setzt otadata auf ota_0 + reboot → CiferTech läuft |
| **Bruce wählen** | Boot-Menü setzt otadata auf ota_1 + reboot → Bruce läuft |
| **GPIO0 5s halten beim Einschalten** | Bootloader löscht otadata → bootet factory → **Boot-Menü erscheint** |
| **Nächster Kaltstart** | otadata zeigt auf ota_X → Ziel-FW startet direkt |

### Layout (16MB Flash)
```
0x000000 — Bootloader (custom, 24KB, mit Factory-Reset via GPIO0)
0x008000 — Partition Table
0x00E000 — OTA Data (leer → bootloader bootet factory)
0x020000 — Factory: Boot-Menü (315KB) — zeigt UI bei jedem ersten Boot
0x320000 — ota_0: CiferTech v1.6.0 (4MB Slot)
0x720000 — ota_1: Bruce Full (4MB Slot)
0xB20000 — Storage/Spiffs (~5MB)
```

### Boot-Menü Feature
- ILI9341 Display mit 6x8 Font, eigener Treiber (kein TFT_eSPI nötig)
- PCF8574 Buttons via I²C (UP/DOWN/SELECT/LEFT/RIGHT)
- Auswahl: CiferTech / Bruce Full
- 10s Timeout → autoboot CiferTech
- GPIO0 Recovery: 5s gedrückt halten → zurück zum Menü

## Flash
```
scp marvin@deepclaw:/tmp/bruce-esp32-div/DualBoot-esp32-div.bin .
```
Dann via https://esptool.spacehuhn.com/ (ESP32-S3, DIO, 80MHz, 16MB)

## Build
```bash
# Boot-Menü + Bootloader (einmalig)
cd /tmp/esp32-dualboot2 && pio run --environment esp32-s3-devkitc-1

# Bruce Full
cd /tmp/bruce-esp32-div && pio run --environment esp32-div
```
