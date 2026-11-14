/**
 * Catches a render error anywhere in the page and says so, in place of a
 * blank page. Start over remounts the page, which brings back the
 * new-visitor state.
 *
 * React only catches render errors in a class component (there is no hook
 * for it), so this one small class is the exception to the repo's no-classes
 * rule.
 */
import { Component, Fragment, type ReactNode } from 'react'

type State = { error: Error | null; attempt: number }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
    override state: State = { error: null, attempt: 0 }

    static getDerivedStateFromError(error: unknown): Partial<State> {
        return {
            error: error instanceof Error ? error : new Error(String(error)),
        }
    }

    private startOver = () => {
        this.setState(({ attempt }) => ({ error: null, attempt: attempt + 1 }))
    }

    override render() {
        const { error, attempt } = this.state
        if (error)
            return (
                <main className="planner">
                    <div role="alert" className="read-error">
                        <p>Something went wrong showing this file.</p>
                        <p>{error.message}</p>
                    </div>
                    <button type="button" onClick={this.startOver}>
                        Start over
                    </button>
                </main>
            )
        return <Fragment key={attempt}>{this.props.children}</Fragment>
    }
}
