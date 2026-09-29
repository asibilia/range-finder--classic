local Spell =
{
	Name = "Spell",
	Type = "System",
	Namespace = "C_Spell",
	Environment = "All",

	Functions =
	{
		{
			Name = "GetSpellCooldown",
			Type = "Function",
			SecretWhenCooldownsRestricted = true,
		},
		{
			Name = "GetSpellName",
			Type = "Function",
		},
	},

	Events =
	{
	},

	Tables =
	{
	},
};

APIDocumentation:AddDocumentationTable(Spell);
