local Unit =
{
	Name = "Unit",
	Type = "System",
	Environment = "All",

	Functions =
	{
		{
			Name = "GetTime",
			Type = "Function",

			Returns =
			{
				{ Name = "seconds", Type = "number", Nilable = false },
			},
		},
		{
			Name = "UnitHealth",
			Type = "Function",
			SecretReturns = true,
			SecretArguments = "AllowedWhenUntainted",

			Arguments =
			{
				{ Name = "unit", Type = "UnitToken", Nilable = false },
			},

			Returns =
			{
				{ Name = "result", Type = "number", Nilable = false },
			},
		},
		{
			Name = "UnitPowerType",
			Type = "Function",

			Returns =
			{
				{ Name = "powerType", Type = "PowerType", Nilable = false, SecretValue = true },
			},
		},
	},

	Events =
	{
		{
			Name = "UnitHealth",
			Type = "Event",
			LiteralName = "UNIT_HEALTH",
		},
	},

	Tables =
	{
	},
};

APIDocumentation:AddDocumentationTable(Unit);
