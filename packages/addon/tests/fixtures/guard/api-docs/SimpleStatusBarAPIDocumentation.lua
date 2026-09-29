local SimpleStatusBarAPI =
{
	Name = "SimpleStatusBarAPI",
	Type = "ScriptObject",
	Environment = "All",

	Functions =
	{
		{
			Name = "GetValue",
			Type = "Function",
			SecretReturnsForAspect = { Enum.SecretAspect.BarValue },
		},
		{
			Name = "SetValue",
			Type = "Function",
			SecretArguments = "AllowedWhenUntainted",
		},
	},

	Events =
	{
	},

	Tables =
	{
	},
};

APIDocumentation:AddDocumentationTable(SimpleStatusBarAPI);
