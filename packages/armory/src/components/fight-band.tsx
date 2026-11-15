/**
 * The band under the gear, full width, as the approved mockup lays it out:
 * across the fight (the fight or pull chart with its sentences), where the
 * damage comes from and what a point of each stat is worth, and the fight
 * settings (enemy level, fight length, kind of fight, starting mana, time
 * between pulls). Three columns from 90rem, two below (the chart across
 * both), one on a phone.
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

import { fightWords } from '../chart-data'
import {
    type FightSettings,
    fightFor,
    missWords,
    settingsChoices,
    settingsOf,
} from '../fight-settings'
import { lengthWords } from '../format'
import type { Plan } from '../plans'
import type { ResultsFile } from '../results-file'
import { DamageSplit } from './damage-split'
import { FightChart } from './fight-chart'
import { PullChart } from './pull-chart'
import { dpsFights, Provisional } from './readings'
import { Segmented } from './segmented'
import { StatWeights } from './stat-weights'

type Result = ResultsFile['results'][number]

/** What the band's Provisional marker says. */
const BAND_PROVISIONAL_TEXT =
    'Sim numbers are estimates until matched to real fights.'

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
 */
export function FightSettingsForm({
    file,
    fightId,
    onPickFight,
}: {
    file: ResultsFile
    fightId: string
    onPickFight: (fightId: string) => void
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
                    options={choices.levels.map((level) => ({
                        value: String(level),
                        label: String(level),
                    }))}
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

/**
 * The band.
 *
 * @param file - The loaded results file.
 * @param plan - The plan the sliders pick, or null (no plans).
 * @param fightId - The fight the band is on.
 * @param wornOf - What you wear's result on a fight (with a bag item put
 * on, its results); the file's worn results by default.
 * @param onPickFight - Another fight was picked.
 */
export function FightBand({
    file,
    plan,
    fightId,
    wornOf,
    onPickFight,
}: {
    file: ResultsFile
    plan: Plan | null
    fightId: string
    wornOf?: (fightId: string) => Result | null
    onPickFight: (fightId: string) => void
}) {
    const headingId = useId()
    const fight =
        file.fights.find((entry) => entry.fight_id === fightId) ??
        file.fights[0]
    if (!fight) return null
    const resultFor = (gear: string, id: string) =>
        file.results.find(
            (result) => result.gear === gear && result.fight_id === id
        ) ?? null
    const wornResult = wornOf ?? ((id: string) => resultFor('worn', id))
    const worn = wornResult(fight.fight_id)
    const planResult = plan ? resultFor(plan.plan_id, fight.fight_id) : null
    const planLabel = plan?.label ?? null
    // The split and the solid stat bars are for the short fight the
    // readings lead with (solo in the sample), as the mockup keeps them;
    // the dashed bars for the fight picked.
    const reference = dpsFights(file)[0] ?? fight
    const referenceWorn = wornResult(reference.fight_id)

    return (
        <section
            aria-labelledby={headingId}
            data-slot="fight-band"
            data-fight={fight.label}
            className="mt-1.5 grid gap-x-9 gap-y-8 border-t pt-5.5 md:grid-cols-2 min-[90rem]:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)_minmax(0,0.9fr)]"
        >
            <div
                data-slot="fight-band-chart"
                className="flex min-w-0 flex-col md:col-span-2 min-[90rem]:col-span-1"
            >
                <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <h2 id={headingId} className="text-xl leading-tight">
                        Across the fight
                    </h2>
                    <span className="text-[0.8125rem] text-muted-foreground">
                        {fightWords(fight)}
                    </span>
                    {file.provisional && (
                        <Provisional text={BAND_PROVISIONAL_TEXT} />
                    )}
                    {file.sample && (
                        <span className="text-[0.71875rem] text-muted-foreground italic">
                            Sample file
                        </span>
                    )}
                </div>
                {!worn ? (
                    <p className="text-sm text-muted-foreground">
                        Not simmed for what you wear.
                    </p>
                ) : fight.kind === 'chain' ? (
                    <PullChart
                        fight={fight}
                        worn={worn}
                        plan={planResult}
                        planLabel={planLabel}
                    />
                ) : (
                    <FightChart
                        fight={fight}
                        worn={worn}
                        plan={planResult}
                        planLabel={planLabel}
                    />
                )}
            </div>
            <div className="flex min-w-0 flex-col">
                {referenceWorn && (
                    <DamageSplit
                        worn={referenceWorn}
                        fightLabel={fightWords(reference)}
                    />
                )}
                <StatWeights
                    file={file}
                    fightId={reference.fight_id}
                    compareId={fight.fight_id}
                />
            </div>
            <FightSettingsForm
                file={file}
                fightId={fight.fight_id}
                onPickFight={onPickFight}
            />
        </section>
    )
}
