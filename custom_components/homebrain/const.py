"""Constants for HomeBrain."""

DOMAIN = "homebrain"
HEALTH_BINDING_KEYS = (
    "health_source_status",
    "health_last_success",
    "health_next_step",
    "health_weekly_strength_progress",
    "health_weekly_goal_met",
    "health_weekly_workout_duration",
    "health_streak_weeks",
    "health_xp_total",
    "health_xp_level",
    "health_xp_level_progress",
    "health_last_workout",
    "health_last_workout_duration",
    "health_weight_trend",
    "health_sleep_last",
    "health_milestone_0500",
    "health_milestone_1500",
    "health_milestone_3000",
    "health_milestone_5000",
    "health_milestone_10000",
    "health_flex_meal_token",
)
ENERGY_BINDING_KEYS = (
    "energy_pv_power",
    "energy_pv1_power",
    "energy_pv2_power",
    "energy_grid_power",
    "energy_grid_import_power",
    "energy_grid_export_power",
    "energy_battery_soc",
    "energy_battery_power",
    "energy_house_power",
    "energy_phase_l1_power",
    "energy_phase_l2_power",
    "energy_phase_l3_power",
    "energy_grid_l1_power",
    "energy_grid_l2_power",
    "energy_grid_l3_power",
    "energy_grid_l1_current",
    "energy_grid_l2_current",
    "energy_grid_l3_current",
    "energy_main_breaker",
    "energy_pv_energy_today",
    "energy_grid_import_energy_today",
    "energy_grid_export_energy_today",
    "energy_house_energy_today",
    "energy_battery_charge_energy_today",
    "energy_battery_discharge_energy_today",
    "energy_pv_forecast_today",
    "energy_pv_forecast_tomorrow",
    "energy_spot_price_electricity",
    "energy_spot_prices_electricity_tomorrow",
    "energy_inverter_status",
    "energy_inverter_power",
    "energy_inverter_l1_power",
    "energy_inverter_l2_power",
    "energy_inverter_l3_power",
    "energy_inverter_error",
    "energy_pv1_voltage",
    "energy_pv2_voltage",
    "energy_battery_voltage",
    "energy_battery_current",
    "energy_inverter_temp_radiator",
    "energy_inverter_temp_air",
    "energy_battery_temp",
    "energy_battery_cell_temp_max",
    "energy_battery_cell_temp_min",
    "energy_battery_cell_voltage_max",
    "energy_battery_cell_voltage_min",
    "energy_battery_soh",
    # Appliance slots (Spotřebiče): power W, energy kWh total_increasing, read-only switch.
    "energy_appliance_heat_pump_power",
    "energy_appliance_heat_pump_energy",
    "energy_appliance_heat_pump_switch",
    "energy_appliance_dishwasher_power",
    "energy_appliance_dishwasher_energy",
    "energy_appliance_dishwasher_switch",
    "energy_appliance_coffee_maker_power",
    "energy_appliance_coffee_maker_energy",
    "energy_appliance_coffee_maker_switch",
    "energy_appliance_dehumidifier_power",
    "energy_appliance_dehumidifier_energy",
    "energy_appliance_dehumidifier_switch",
)
# Recepty bindings: entity ids are household data, so they live only in the HA options.
RECIPES_BINDING_KEYS = (
    "recipes_media_session",
    "recipes_airfryer_start",
    "recipes_airfryer_temperature",
    "recipes_airfryer_cook_time",
    "recipes_airfryer_method",
    "recipes_airfryer_drawer",
    "recipes_airfryer_remaining",
)
BINDING_MODULES = {
    "waste": ("waste_dataset", "waste_next", "waste_calendar", "waste_history"),
    "wine": (
        "wine_cellar_temperature",
        "wine_cellar_humidity",
        "wine_zone_1_temperature",
        "wine_zone_1_target",
        "wine_zone_1_humidity",
        "wine_zone_2_temperature",
        "wine_zone_2_target",
        "wine_zone_2_humidity",
        "wine_light",
        "wine_error",
    ),
    "energy": ENERGY_BINDING_KEYS,
    # Recepty: kitchen tablet media session (HA Companion) + an optional airfryer.
    "recipes": RECIPES_BINDING_KEYS,
    "health": HEALTH_BINDING_KEYS,
    # Shared family / school calendars (calendar.*); Dnes shows today's events on the ribbon.
    "family": ("family_calendar_family", "family_calendar_school"),
    # Station entities (e.g. Ecowitt) + the met.no weather entity; see weather/station.py.
    "weather": (
        "weather_temperature",
        "weather_humidity",
        "weather_dew_point",
        "weather_feels_like",
        "weather_pressure",
        "weather_wind_speed",
        "weather_wind_gust",
        "weather_wind_direction",
        "weather_rain_rate",
        "weather_rain_daily",
        "weather_rain_state",
        "weather_uv",
        "weather_solar_radiation",
        "weather_indoor_temperature",
        "weather_indoor_humidity",
        "weather_forecast",
    ),
}
# Health keys published as on/off by the health adapter (binary_sensor or template sensor).
HEALTH_BINARY_BINDING_KEYS = (
    "health_weekly_goal_met",
    "health_flex_meal_token",
    "health_milestone_0500",
    "health_milestone_1500",
    "health_milestone_3000",
    "health_milestone_5000",
    "health_milestone_10000",
)
# Entity domain(s) allowed per logical key (first = primary); unlisted keys default to "sensor".
BINDING_DOMAINS: dict[str, str | tuple[str, ...]] = {
    **{key: ("binary_sensor", "sensor") for key in HEALTH_BINARY_BINDING_KEYS},
    "waste_calendar": "calendar",
    "family_calendar_family": "calendar",
    "family_calendar_school": "calendar",
    "weather_forecast": "weather",
    "wine_light": "light",
    "energy_appliance_heat_pump_switch": "switch",
    "energy_appliance_dishwasher_switch": "switch",
    "energy_appliance_coffee_maker_switch": "switch",
    "energy_appliance_dehumidifier_switch": "switch",
    # Main breaker rating is a constant: a helper (input_number/number) or a sensor.
    "energy_main_breaker": ("input_number", "number", "sensor"),
    "recipes_airfryer_start": "button",
    "recipes_airfryer_temperature": "number",
    "recipes_airfryer_cook_time": "number",
    "recipes_airfryer_method": "select",
    "recipes_airfryer_drawer": "binary_sensor",
}
DEFAULT_BINDING_DOMAIN = "sensor"
PANEL_URL_PATH = "homebrain"
PANEL_TITLE = "HomeBrain"
SETTINGS_PANEL_URL_PATH = "homebrain-nastaveni"
# Wall-tablet panel (ADR-0002): always Dnes in kiosk layout, open to mapped non-admin users.
KIOSK_PANEL_URL_PATH = "homebrain-kiosk"
KIOSK_PANEL_TITLE = "Dnes"
KIOSK_PANEL_ICON = "mdi:tablet-dashboard"
WEB_COMPONENT = "homebrain-panel"
STATIC_URL_BASE = "/homebrain_static"

MODULE_PANELS = {
    "homebrain-dnes": {"title": "Dnes", "icon": "mdi:calendar-today", "module": "today"},
    "homebrain-pocasi": {
        "title": "Počasí",
        "icon": "mdi:weather-partly-cloudy",
        "module": "weather",
    },
    "homebrain-energie": {"title": "Energie", "icon": "mdi:lightning-bolt", "module": "energy"},
    "homebrain-odpady": {"title": "Odpady", "icon": "mdi:delete-empty", "module": "waste"},
    "homebrain-vinoteka": {"title": "Vinotéka", "icon": "mdi:glass-wine", "module": "wine"},
    "homebrain-zdravi": {"title": "Zdraví", "icon": "mdi:heart-pulse", "module": "health"},
    # Přístup (BioLock): admin only – people, enrolment, device switches.
    "homebrain-pristup": {"title": "Přístup", "icon": "mdi:fingerprint", "module": "access"},
    # Kitchen tablet (non-admin, mapped role) opens Recepty too; the WS layer enforces roles.
    "homebrain-recepty": {
        "title": "Recepty",
        "icon": "mdi:chef-hat",
        "module": "recipes",
        "require_admin": False,
    },
}
