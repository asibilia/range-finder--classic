import { type CommitConfig } from '@alecsibilia/commit'

const config: CommitConfig = {
    types: [
        { value: 'feat', label: '✨ A new feature' },
        { value: 'fix', label: '🐛 A bug fix' },
        { value: 'docs', label: '📚 Documentation only changes' },
        {
            value: 'style',
            label: '💎 Changes that do not affect the meaning of the code',
        },
        {
            value: 'refactor',
            label: '📦 A code change that neither fixes a bug nor adds a feature',
        },
        { value: 'test', label: '🚨 Adding missing tests' },
        {
            value: 'chore',
            label: '♻️ Changes to the build process or auxiliary tools',
        },
        { value: 'ci', label: '🤖 CI workflows' },
    ],
    scopes: [
        { value: 'addon', label: 'The Turbo addon (Lua) and its tests' },
        { value: 'web', label: 'The Turbo site' },
        { value: 'probe', label: 'The probe (dev tool)' },
        { value: 'config', label: 'Configuration' },
        { value: 'repo', label: 'Repository & Tooling' },
    ],
    git: {
        auto_add_all: true,
        auto_push: false,
    },
}

export default config
