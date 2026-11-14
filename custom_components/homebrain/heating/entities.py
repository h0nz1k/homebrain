"""Topení entities: one sensor/binary_sensor per mapped contract key + derived counters.

Entity ids are fixed (``sensor.heating_tank_bottom``) so the recorder's long-term
statistics, ``history`` and ``import_history`` all use the same statistic ids.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.core import callback
from homeassistant.helpers.entity import Entity

from .keys import ACTIVITIES, COUNTER_KEYS, KeySpec, object_id, spec_of
from .poller import HeatingPoller

TOTAL_KEYS = COUNTER_KEYS | {"heat_pump.motohours"}


def unique_id(key: str) -> str:
    return f"heating_{object_id(key)}"


class _HeatingEntity(Entity):
    _attr_should_poll = False

    def __init__(self, poller: HeatingPoller, key: str, platform: str, spec: KeySpec) -> None:
        self._poller = poller
        self._key = key
        self._attr_unique_id = unique_id(key)
        self._attr_name = spec.label
        self.entity_id = f"{platform}.{unique_id(key)}"

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self._poller.add_listener(self._updated))

    @callback
    def _updated(self) -> None:
        self.async_write_ha_state()

    @property
    def available(self) -> bool:
        return self._poller.value(self._key) is not None


class HeatingSensor(_HeatingEntity, SensorEntity):
    def __init__(self, poller: HeatingPoller, key: str, spec: KeySpec) -> None:
        super().__init__(poller, key, "sensor", spec)
        self._attr_native_unit_of_measurement = spec.unit
        if spec.device_class:
            self._attr_device_class = SensorDeviceClass(spec.device_class)
        self._attr_state_class = (
            SensorStateClass.TOTAL_INCREASING if key in TOTAL_KEYS else SensorStateClass.MEASUREMENT
        )
        if key == "compressor_runtime_h":
            self._attr_suggested_display_precision = 2

    @property
    def native_value(self) -> Any:
        return self._poller.value(self._key)


class HeatingActivitySensor(_HeatingEntity, SensorEntity):
    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = list(ACTIVITIES)

    def __init__(self, poller: HeatingPoller) -> None:
        super().__init__(
            poller, "activity", "sensor", KeySpec("text", None, None, "Topení – činnost")
        )

    @property
    def native_value(self) -> str | None:
        return self._poller.value("activity")


class HeatingBinarySensor(_HeatingEntity, BinarySensorEntity):
    def __init__(self, poller: HeatingPoller, key: str, spec: KeySpec) -> None:
        super().__init__(poller, key, "binary_sensor", spec)
        if spec.device_class:
            self._attr_device_class = BinarySensorDeviceClass(spec.device_class)

    @property
    def is_on(self) -> bool | None:
        value = self._poller.value(self._key)
        return None if value is None else bool(value)


class HeatingAlertsSensor(_HeatingEntity, SensorEntity):
    def __init__(self, poller: HeatingPoller) -> None:
        super().__init__(
            poller,
            "alerts",
            "sensor",
            KeySpec("num", None, None, "Topení – upozornění"),
        )
        self.entity_id = "sensor.heating_alerts"

    @property
    def native_value(self) -> int:
        count, _items = self._poller.alert_summary()
        return count

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        _count, items = self._poller.alert_summary()
        return {"alerts": items}


class HeatingProblemBinarySensor(_HeatingEntity, BinarySensorEntity):
    def __init__(self, poller: HeatingPoller) -> None:
        super().__init__(
            poller,
            "problem",
            "binary_sensor",
            KeySpec("bool", None, "problem", "Topení – problém"),
        )
        self.entity_id = "binary_sensor.heating_problem"
        self._attr_device_class = BinarySensorDeviceClass.PROBLEM

    @property
    def is_on(self) -> bool:
        count, _items = self._poller.alert_summary()
        return count > 0

    @property
    def available(self) -> bool:
        return True


def build_entities(poller: HeatingPoller, platform: str) -> list[Entity]:
    out: list[Entity] = []
    for key in poller.entity_keys():
        spec = spec_of(key)
        if spec is None:
            continue
        if spec.kind == "bool" and platform == "binary_sensor":
            out.append(HeatingBinarySensor(poller, key, spec))
        elif spec.kind == "num" and platform == "sensor":
            out.append(HeatingSensor(poller, key, spec))
    if platform == "sensor":
        out.append(HeatingActivitySensor(poller))
        out.append(HeatingAlertsSensor(poller))
    if platform == "binary_sensor":
        out.append(HeatingProblemBinarySensor(poller))
    return out
