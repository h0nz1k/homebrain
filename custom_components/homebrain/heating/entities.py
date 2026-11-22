"""Topení entities: one sensor/binary_sensor per mapped contract key + derived counters.

Entity ids are fixed (``sensor.heating_tank_bottom``) so the recorder's long-term
statistics, ``history`` and ``import_history`` all use the same statistic ids.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from math import isfinite
from typing import Any

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.components.sensor import (
    RestoreSensor,
    SensorDeviceClass,
    SensorEntity,
    SensorExtraStoredData,
    SensorStateClass,
)
from homeassistant.core import callback
from homeassistant.helpers.entity import Entity
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from .keys import ACTIVITIES, COUNTER_KEYS, RUNTIME_SOURCES, KeySpec, object_id, spec_of
from .model import MAX_GAP
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


@dataclass
class RuntimeExtraStoredData(SensorExtraStoredData):
    day: str

    def as_dict(self) -> dict[str, Any]:
        return {**super().as_dict(), "runtime_date": self.day}


class HeatingRuntimeSensor(HeatingSensor, RestoreSensor):
    _attr_suggested_display_precision = 2

    def __init__(self, poller: HeatingPoller, key: str, spec: KeySpec) -> None:
        super().__init__(poller, key, spec)
        self._source_key = RUNTIME_SOURCES[key]
        self._day = dt_util.now().date()
        self._hours = 0.0
        self._sample: tuple[datetime, bool] | None = None
        self._max_gap = min(MAX_GAP, timedelta(seconds=max(120, 3 * poller.opts.interval)))

    async def async_added_to_hass(self) -> None:
        extra = await self.async_get_last_extra_data()
        restored = extra.as_dict() if extra is not None else {}
        if extra is None and (last := await self.async_get_last_state()) is not None:
            restored = last.attributes  # Legacy sensor state before extra restore data.
        if restored.get("runtime_date") == self._day.isoformat():
            try:
                hours = float(restored.get("native_value", restored.get("runtime_hours")))
            except (TypeError, ValueError):
                pass
            else:
                if isfinite(hours) and 0 <= hours <= 25:
                    self._hours = hours
        self._sample = self._poller.runtime_sample(self._source_key)
        await super().async_added_to_hass()
        self.async_on_remove(
            async_track_time_change(self.hass, self._midnight, hour=0, minute=0, second=0)
        )

    @property
    def available(self) -> bool:
        return self._sample is not None and dt_util.utcnow() - self._sample[0] <= self._max_gap

    @property
    def native_value(self) -> float:
        return round(self._hours, 6)

    @property
    def extra_restore_state_data(self) -> RuntimeExtraStoredData:
        return RuntimeExtraStoredData(
            self._hours, self.native_unit_of_measurement, self._day.isoformat()
        )

    @callback
    def _midnight(self, now: datetime) -> None:
        self._reset(now)
        self.async_write_ha_state()

    def _reset(self, now: datetime) -> None:
        if now.date() != self._day:
            self._hours = 0.0
            self._day = now.date()

    @callback
    def _updated(self) -> None:
        now = dt_util.now()
        self._reset(now)
        sample = self._poller.runtime_sample(self._source_key)
        if sample and self._sample and self._sample[1]:
            elapsed = sample[0] - self._sample[0]
            if timedelta(0) < elapsed <= self._max_gap:
                start = max(self._sample[0], dt_util.start_of_local_day(self._day))
                self._hours += max(0.0, (sample[0] - start).total_seconds()) / 3600
        self._sample = sample
        self.async_write_ha_state()


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
            entity_type = HeatingRuntimeSensor if key in RUNTIME_SOURCES else HeatingSensor
            out.append(entity_type(poller, key, spec))
    if platform == "sensor":
        out.append(HeatingActivitySensor(poller))
        out.append(HeatingAlertsSensor(poller))
    if platform == "binary_sensor":
        out.append(HeatingProblemBinarySensor(poller))
    return out
