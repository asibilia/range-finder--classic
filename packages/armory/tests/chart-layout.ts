/**
 * happy-dom lays nothing out, so every element measures 0 by 0 and Recharts'
 * responsive container (inside shadcn's `ChartContainer`) would draw no
 * chart. This gives the chart containers a fixed size, 480 by 260, the way
 * a browser would lay out the card; nothing else is touched. Import it after
 * `./dom`.
 */
const SIZE = { width: 480, height: 260 }

const measure = HTMLElement.prototype.getBoundingClientRect

HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    if (this.classList.contains('recharts-responsive-container'))
        return {
            ...SIZE,
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: SIZE.width,
            bottom: SIZE.height,
            toJSON: () => SIZE,
        } as DOMRect
    return measure.call(this)
}
