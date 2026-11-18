/**
 * The fight settings (enemy level, fight length, kind of fight, starting
 * mana, time between pulls), in the card under Simulator Data, as the
 * owner's design (layout v2) places them. Each enemy level is coloured by
 * how hard it is for the character, the game's con colour
 * (`con-colour.ts`); the picked one sits on a tint of its colour.
 *
 * Nothing is re-simmed: the settings pick one of the file's fights
 * (`fight-settings.ts`) through `onPickFight` (the `pick-fight` action). A
 * combination the file has no fight for says `Not simmed for this
 * combination.` and lists the fights it has; the chart and the readings
 * stay on the last fight picked.
 */
import { useEffect, useId, useState } from 'react'

import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'

import { type ConColour, conColour } from '../con-colour'
import {
    type FightSettings,
    fightFor,
    missWords,
    settingsChoices,
    settingsOf,
} from '../fight-settings'
import { lengthWords } from '../format'
import type { ResultsFile } from '../results-file'
import { Segmented } from './segmented'

/**
 * An enemy level's text colour and, when picked, its tint (15%: the
 * contrast test checks the text on it at that strength).
 */
const CON_CLASSES: Record<ConColour, { text: string; picked: string }> = {
    red: { text: 'text-con-red', picked: 'bg-con-red/15' },
    orange: { text: 'text-con-orange', picked: 'bg-con-orange/15' },
    yellow: { text: 'text-con-yellow', picked: 'bg-con-yellow/15' },
    green: { text: 'text-con-green', picked: 'bg-con-green/15' },
    grey: { text: 'text-con-grey', picked: 'bg-con-grey/15' },
}

function RangeRow({
    label,
    value,
    shown,
    range,
    onChange,
}: {
    label: string
    value: number
    shown: string
    range: { min: number; max: number; step: number }
    onChange: (value: number) => void
}) {
    const labelId = useId()
    return (
        <div>
            <div className="mb-1 flex justify-between text-sm">
                <span id={labelId}>{label}</span>
                <span className="text-muted-foreground tabular-nums">
                    {shown}
                </span>
            </div>
            <Slider
                className="px-2.25 py-1.25"
                value={[value]}
                min={range.min}
                max={range.max}
                step={range.step}
                onValueChange={(next) => {
                    const [first] = Array.isArray(next) ? next : [next]
                    if (typeof first === 'number') onChange(first)
                }}
                thumbProps={{
                    'aria-labelledby': labelId,
                    getAriaValueText: () => shown,
                }}
            />
        </div>
    )
}

/**
 * The fight settings.
 *
 * @param file - The loaded results file.
 * @param fightId - The fight picked last (the chart and readings show it).
 * @param onPickFight - The settings picked another fight.
 * @param onSettings - Hears the settings each time they change (Run
 * Simulator sims them).
 */
export function FightSettingsForm({
    file,
    fightId,
    onPickFight,
    onSettings,
}: {
    file: ResultsFile
    fightId: string
    onPickFight: (fightId: string) => void
    onSettings?: (settings: FightSettings) => void
}) {
    const fight =
        file.fights.find((entry) => entry.fight_id === fightId) ??
        file.fights[0]
    const [settings, setSettings] = useState<FightSettings | null>(
        fight ? settingsOf(file, fight) : null
    )
    const missId = useId()
    const kindId = useId()
    const lengthId = useId()
    const picked = settings ? fightFor(file, settings) : null

    // A fight picked from elsewhere (a fight in the not-simmed list, an
    // action) moves the controls to it.
    useEffect(() => {
        if (!fight) return
        setSettings((current) =>
            current && fightFor(file, current)?.fight_id === fight.fight_id
                ? current
                : settingsOf(file, fight)
        )
    }, [file, fight])

    // The page hears where the controls are, for Run Simulator.
    useEffect(() => {
        if (settings) onSettings?.(settings)
    }, [settings])

    if (!settings || !fight) return null
    const choices = settingsChoices(file)
    const change = (next: Partial<FightSettings>) => {
        const updated = { ...settings, ...next }
        setSettings(updated)
        const match = fightFor(file, updated)
        if (match && match.fight_id !== fightId) onPickFight(match.fight_id)
    }
    const miss = missWords(file, settings.level)
    const lengths = choices.lengths_s.map((length) => ({
        value: String(length),
        label: lengthWords(length),
    }))

    return (
        <form
            aria-labelledby="fight-settings-heading"
            onSubmit={(event) => event.preventDefault()}
            className="flex min-w-0 flex-col gap-3.5"
        >
            <h2
                id="fight-settings-heading"
                className="-mb-2 text-xl leading-tight"
            >
                Fight settings
            </h2>
            <div>
                <Segmented
                    legend="Enemy level"
                    options={choices.levels.map((level) => {
                        const con =
                            CON_CLASSES[conColour(level, file.character.level)]
                        return {
                            value: String(level),
                            label: String(level),
                            className: con.text,
                            pickedClassName: con.picked,
                        }
                    })}
                    value={String(settings.level)}
                    onChange={(value) => change({ level: Number(value) })}
                    describedBy={miss ? missId : undefined}
                />
                {miss && (
                    <p
                        id={missId}
                        className="mt-1 text-[0.78125rem] text-muted-foreground"
                    >
                        {miss}
                    </p>
                )}
            </div>
            <div className="flex flex-col gap-1">
                <span id={lengthId} className="text-sm">
                    Fight length
                </span>
                <Select
                    items={lengths}
                    value={String(settings.length_s)}
                    onValueChange={(value) => {
                        if (typeof value === 'string')
                            change({ length_s: Number(value) })
                    }}
                >
                    <SelectTrigger
                        aria-labelledby={lengthId}
                        className="h-auto w-full rounded-lg px-2.5 py-1.75"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            {lengths.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                    {item.label}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </div>
            <div>
                <Segmented
                    legend="Kind of fight"
                    options={[
                        { value: 'pve', label: 'PvE' },
                        { value: 'pvp', label: 'PvP', disabled: true },
                    ]}
                    value={settings.kind}
                    onChange={() => {}}
                    describedBy={kindId}
                />
                <p
                    id={kindId}
                    className="mt-1 text-[0.78125rem] text-muted-foreground"
                >
                    PvP: Not simmed yet
                </p>
            </div>
            <RangeRow
                label="Starting mana"
                value={settings.mana}
                shown={String(settings.mana)}
                range={choices.mana}
                onChange={(mana) => change({ mana })}
            />
            <RangeRow
                label="Time between pulls"
                value={settings.gap_s}
                shown={`${settings.gap_s} s`}
                range={choices.gap}
                onChange={(gap_s) => change({ gap_s })}
            />
            {!picked && (
                <div
                    role="status"
                    className="rounded-lg border border-dashed px-3 py-2 text-[0.8125rem]"
                >
                    <p>Not simmed for this combination.</p>
                    <p className="mt-1 text-muted-foreground">
                        {`Still showing ${fight.label}. The file has:`}
                    </p>
                    <ul className="mt-1 flex flex-col items-start gap-0.5">
                        {file.fights.map((entry) => (
                            <li key={entry.fight_id}>
                                <button
                                    type="button"
                                    className="text-left underline underline-offset-3 hover:text-foreground"
                                    onClick={() => {
                                        setSettings(settingsOf(file, entry))
                                        onPickFight(entry.fight_id)
                                    }}
                                >
                                    {entry.label}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </form>
    )
}
