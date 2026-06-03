#include <Arduino.h>
#include <esp_ota_ops.h>
#include <esp_partition.h>

#define BOOT_SEL_PIN 0

void setup() {
    pinMode(BOOT_SEL_PIN, INPUT_PULLUP);
    delay(10);
    int sel = digitalRead(BOOT_SEL_PIN);

    const esp_partition_t *target = NULL;

    if (sel == LOW)
        target = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_0, NULL);
    else
        target = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_1, NULL);

    if (target == NULL) {
        if (sel == LOW)
            target = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_1, NULL);
        else
            target = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_0, NULL);
    }

    if (target != NULL)
        esp_ota_set_boot_partition(target);

    esp_restart();
}

void loop() { delay(1000); }
