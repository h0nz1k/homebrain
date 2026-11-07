"""Config flow for HomeBrain."""

from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers import selector

from .bindings import binding_domains, get_bindings, validate_binding
from .const import BINDING_MODULES, DOMAIN, MEALS_DISPLAY, MEALS_DISPLAY_MODES, PANEL_TITLE
from .energy.pv_forecast import OPTION_KEY as PV_OPTION_KEY
from .modules import CONF_DISABLED_MODULES, MODULES, disabled_modules
from .network.unifi_client import UnifiAuthError, UnifiConfig, UnifiError
from .network.unifi_poller import async_validate_unifi
from .robots.config import (
    CONF_ROBOTS,
    ROBOT_SLOTS,
    ROTATIONS,
    clean_rotation,
    clean_text,
    slot_keys,
    slot_settings,
    valid_image,
)
from .robots.discovery import discover_bindings, discover_floor, missing_bindings

UNIFI_OPTION_KEY = "network_unifi"
OPTIONS_FLOW_MODULES = ("waste", "energy", "family", "recipes")
# Extra menu steps that are not entity bindings.
OPTIONS_FLOW_EXTRA = (
    "energy_pv",
    *(f"robots_{slot}" for slot in ROBOT_SLOTS),
    "network_unifi",
    "modules",
    "meals",
)


class HomeBrainConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Set up a single HomeBrain instance."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry) -> "HomeBrainOptionsFlow":
        """Create the options flow."""
        return HomeBrainOptionsFlow()

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Confirm setup without requiring configuration fields."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(title=PANEL_TITLE, data={})
        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))


class HomeBrainOptionsFlow(config_entries.OptionsFlow):
    """Configure module entity bindings, one step per module."""

    def __init__(self) -> None:
        """Remember per robot slot which vacuum was already offered its discovered entities."""
        self._prefilled: dict[int, str] = {}

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Choose which module bindings to edit."""
        # Only modules with an options step; weather bindings are not edited here (yet).
        return self.async_show_menu(
            step_id="init", menu_options=[*OPTIONS_FLOW_MODULES, *OPTIONS_FLOW_EXTRA]
        )

    async def async_step_waste(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Select optional waste sensors and calendar."""
        return self._bindings_step("waste", user_input)

    async def async_step_energy(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Select optional energy sensors (power, daily energy, battery, spot price)."""
        return self._bindings_step("energy", user_input)

    async def async_step_family(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Select the family/school calendars and the shared shopping list (todo)."""
        return self._bindings_step("family", user_input)

    async def async_step_recipes(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Kitchen tablet media session sensor + optional airfryer entities (by domain)."""
        return self._bindings_step("recipes", user_input)

    async def async_step_energy_pv(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """PV system parameters for the forecast fallback and the advice; all optional."""
        current = self.config_entry.options.get(PV_OPTION_KEY) or {}
        fields = {
            "pv_kwp": (0.01, 100, 0.01, "kWp"),
            "pv_tilt": (0, 90, 1, "°"),
            "pv_azimuth": (-180, 180, 1, "°"),
            "inverter_ac_limit_kw": (0.1, 100, 0.1, "kW"),
            "battery_capacity_kwh": (0.1, 500, 0.1, "kWh"),
            "export_limit_kw": (0, 100, 0.1, "kW"),
        }
        if user_input is not None:
            options = {**self.config_entry.options}
            values = {
                key: float(user_input[key])
                for key in fields
                if user_input.get(key) not in (None, "")
            }
            if values:
                options[PV_OPTION_KEY] = values
            else:
                options.pop(PV_OPTION_KEY, None)
            return self.async_create_entry(title="", data=options)

        def number(lo: float, hi: float, step: float, unit: str) -> selector.NumberSelector:
            return selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=lo,
                    max=hi,
                    step=step,
                    unit_of_measurement=unit,
                    mode=selector.NumberSelectorMode.BOX,
                )
            )

        schema = vol.Schema(
            {
                vol.Optional(key, description={"suggested_value": current.get(key)}): number(*cfg)
                for key, cfg in fields.items()
            }
        )
        return self.async_show_form(step_id="energy_pv", data_schema=schema)

    async def async_step_network_unifi(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Optional direct read-only UniFi connection with HomeBrain's own account (V2)."""
        current = self.config_entry.options.get(UNIFI_OPTION_KEY) or {}
        errors: dict[str, str] = {}
        if user_input is not None:
            options = {**self.config_entry.options}
            url = str(user_input.get("url") or "").strip().rstrip("/")
            if not url:
                options.pop(UNIFI_OPTION_KEY, None)
                return self.async_create_entry(title="", data=options)
            values = {
                "url": url,
                "site": str(user_input.get("site") or "default").strip(),
                "username": str(user_input.get("username") or "").strip(),
                # an empty password field keeps the stored one (it is never shown back)
                "password": user_input.get("password") or current.get("password") or "",
                "verify_ssl": bool(user_input.get("verify_ssl", False)),
            }
            if not url.startswith(("http://", "https://")):
                errors["url"] = "invalid_url"
            elif not values["username"] or not values["password"]:
                errors["base"] = "invalid_auth"
            else:
                try:
                    await async_validate_unifi(self.hass, UnifiConfig.from_options(values))
                except UnifiAuthError:
                    errors["base"] = "invalid_auth"
                except UnifiError:
                    errors["base"] = "cannot_connect"
                else:
                    options[UNIFI_OPTION_KEY] = values
                    return self.async_create_entry(title="", data=options)
            current = {**values, "password": ""}

        schema = vol.Schema(
            {
                vol.Optional(
                    "url", description={"suggested_value": current.get("url", "")}
                ): selector.TextSelector(selector.TextSelectorConfig(type="url")),
                vol.Optional(
                    "site", default=current.get("site") or "default"
                ): selector.TextSelector(),
                vol.Optional(
                    "username", description={"suggested_value": current.get("username", "")}
                ): selector.TextSelector(),
                vol.Optional("password"): selector.TextSelector(
                    selector.TextSelectorConfig(type="password")
                ),
                vol.Optional(
                    "verify_ssl", default=bool(current.get("verify_ssl", False))
                ): selector.BooleanSelector(),
            }
        )
        return self.async_show_form(
            step_id="network_unifi",
            data_schema=schema,
            errors=errors,
        )

    async def async_step_meals(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """„Zobrazit jídelníček (Mealie)“: auto = only with a loaded Mealie entry, off = never."""
        if user_input is not None:
            options = {**self.config_entry.options}
            if user_input.get(MEALS_DISPLAY) == "off":
                options[MEALS_DISPLAY] = "off"
            else:
                options.pop(MEALS_DISPLAY, None)  # auto is the default: keep entries unchanged
            return self.async_create_entry(title="", data=options)
        current = self.config_entry.options.get(MEALS_DISPLAY, "auto")
        schema = vol.Schema(
            {
                vol.Optional(
                    MEALS_DISPLAY, default=current if current in MEALS_DISPLAY_MODES else "auto"
                ): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=list(MEALS_DISPLAY_MODES),
                        mode=selector.SelectSelectorMode.LIST,
                        translation_key=MEALS_DISPLAY,
                    )
                )
            }
        )
        return self.async_show_form(step_id="meals", data_schema=schema)

    async def async_step_modules(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Switch modules on/off; a disabled module registers no WS commands nor panel."""
        if user_input is not None:
            enabled = set(user_input.get("enabled_modules") or ())
            options = {**self.config_entry.options}
            if off := [module for module in MODULES if module not in enabled]:
                options[CONF_DISABLED_MODULES] = off
            else:
                # All enabled = the pre-#28 default: keep old entries byte-identical.
                options.pop(CONF_DISABLED_MODULES, None)
            return self.async_create_entry(title="", data=options)
        disabled = disabled_modules(self.config_entry.options)
        schema = vol.Schema(
            {
                vol.Optional(
                    "enabled_modules",
                    default=[module for module in MODULES if module not in disabled],
                ): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=list(MODULES),
                        multiple=True,
                        mode=selector.SelectSelectorMode.LIST,
                        translation_key="modules",
                    )
                )
            }
        )
        return self.async_show_form(step_id="modules", data_schema=schema)

    async def async_step_robots_1(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Robot 1: name, floor, picture and its Roborock entities."""
        return self._robot_step(1, user_input)

    async def async_step_robots_2(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Robot 2: name, floor, picture and its Roborock entities."""
        return self._robot_step(2, user_input)

    async def async_step_robots_3(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Robot 3: name, floor, picture and its Roborock entities."""
        return self._robot_step(3, user_input)

    def _robot_step(self, slot: int, user_input: dict[str, Any] | None) -> FlowResult:
        bindings = get_bindings(self.config_entry)
        values = bindings.setdefault("robots", {})
        current = slot_settings(self.config_entry.options, slot)
        vacuum_key = f"robot{slot}_vacuum"
        prefilled = self._prefilled
        errors: dict[str, str] = {}
        shown = dict(values)
        if user_input is not None:
            image = (user_input.get("image") or "").strip()
            if image and not valid_image(image):
                errors["image"] = "invalid_image"
            chosen: dict[str, str] = {}
            try:
                for key in slot_keys(slot):
                    if value := user_input.get(key):
                        chosen[key] = validate_binding(key, value)
            except vol.Invalid:
                errors["base"] = "invalid_entity_id"
            vacuum = chosen.get(vacuum_key, "")
            extra: dict[str, str] = {}
            if not errors and vacuum and prefilled.get(slot) != vacuum:
                # A newly picked vacuum: show the form once more with its device's entities.
                prefilled[slot] = vacuum
                extra = missing_bindings(chosen, slot, discover_bindings(self.hass, vacuum))
            if not errors and not extra:
                for key in slot_keys(slot):
                    if key in chosen:
                        values[key] = chosen[key]
                    else:
                        values.pop(key, None)
                robots = dict(self.config_entry.options.get(CONF_ROBOTS) or {})
                robots[str(slot)] = {
                    "name": clean_text(user_input.get("name")),
                    "floor": clean_text(user_input.get("floor")),
                    "image": image,
                    "rotation": clean_rotation(user_input.get("rotation", 0)),
                }
                options = {**self.config_entry.options, "bindings": bindings, CONF_ROBOTS: robots}
                return self.async_create_entry(title="", data=options)
            if extra:
                shown = {**chosen, **extra}
                current = {
                    "name": clean_text(user_input.get("name")),
                    "floor": clean_text(user_input.get("floor")),
                    "image": image,
                    "rotation": clean_rotation(user_input.get("rotation", 0)),
                }
        elif vacuum := values.get(vacuum_key):
            prefilled[slot] = vacuum
            shown |= missing_bindings(values, slot, discover_bindings(self.hass, vacuum))
        # HA area -> floor of the vacuum's device wins; the text field is the fallback.
        ha_floor = discover_floor(self.hass, shown.get(vacuum_key, ""))
        floor = ha_floor or current["floor"]
        text = selector.TextSelector()
        schema = vol.Schema(
            {
                vol.Optional("name", description={"suggested_value": current["name"]}): text,
                vol.Optional("floor", description={"suggested_value": floor}): text,
                vol.Optional("image", description={"suggested_value": current["image"]}): text,
                vol.Optional("rotation", default=str(current["rotation"])): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[str(value) for value in ROTATIONS],
                        mode=selector.SelectSelectorMode.DROPDOWN,
                        translation_key="map_rotation",
                    )
                ),
                **{
                    vol.Optional(key, description={"suggested_value": shown.get(key)}): (
                        selector.EntitySelector(
                            selector.EntitySelectorConfig(domain=list(binding_domains(key)))
                        )
                    )
                    for key in slot_keys(slot)
                },
            }
        )
        return self.async_show_form(
            step_id=f"robots_{slot}",
            data_schema=schema,
            errors=errors,
            description_placeholders={"ha_floor": ha_floor or "–"},
        )

    def _bindings_step(self, module: str, user_input: dict[str, Any] | None) -> FlowResult:
        bindings = get_bindings(self.config_entry)
        values = bindings.setdefault(module, {})
        errors = {}
        if user_input is not None:
            try:
                for key in BINDING_MODULES[module]:
                    if value := user_input.get(key):
                        values[key] = validate_binding(key, value)
                    else:
                        values.pop(key, None)
            except vol.Invalid:
                errors["base"] = "invalid_entity_id"
            else:
                options = {**self.config_entry.options, "bindings": bindings}
                return self.async_create_entry(title="", data=options)

        schema = vol.Schema(
            {
                vol.Optional(key, description={"suggested_value": values.get(key)}): (
                    selector.EntitySelector(
                        selector.EntitySelectorConfig(domain=list(binding_domains(key)))
                    )
                )
                for key in BINDING_MODULES[module]
            }
        )
        return self.async_show_form(step_id=module, data_schema=schema, errors=errors)
