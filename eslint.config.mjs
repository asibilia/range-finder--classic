import js from '@eslint/js'
import prettier from 'eslint-plugin-prettier'
import globals from 'globals'
import typescript from 'typescript-eslint'

/** @type {import('eslint').Linter.Config[]} */
export default [
    js.configs.recommended,
    ...typescript.configs.recommended,
    {
        files: ['**/*.{js,mjs,cjs,ts,tsx}'],
        plugins: {
            prettier,
        },
        languageOptions: { globals: globals.node },
        rules: {
            'prettier/prettier': [
                'error',
                {
                    semi: false,
                    singleQuote: true,
                    trailingComma: 'es5',
                    endOfLine: 'lf',
                    printWidth: 80,
                    tabWidth: 4,
                },
            ],
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
            '@typescript-eslint/no-explicit-any': ['warn'],
        },
    },
    {
        ignores: [
            'node_modules/**',
            '**/node_modules/**',
            '**/dist/**',
            '**/build/**',
            '.tools/**',
            '.changeset/**',
            '.claude/**',
            '.luca/**',
        ],
    },
]
