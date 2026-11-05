"""Config flow for HomeBrain."""

from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers import selector

from .bindings import binding_domains, get_bindings, validate_binding
from .const import BINDING_MODULES, DOMAIN, PANEL_TITLE
from .energy.pv_forecast import OPTION_KEY as PV_OPTION_KEY

OPTIONS_FLOW_MODULES = ("waste", "energy", "family", "recipes")
# Extra menu steps that are not entity bindings.
OPTIONS_FLOW_EXTRA = ("energy_pv",)


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
        """Select the family and school calendars (read only; Dnes shows today's events)."""
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
