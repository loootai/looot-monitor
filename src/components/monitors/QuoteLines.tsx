import { usdPrecise } from "@/lib/money";
import type { Quote } from "@/lib/quote";
import { cn } from "@/lib/utils";

/** The lines of a quote: endpoint, calls and price, then the per-run total. */
export function QuoteLines({ quote, dim }: { quote: Quote; dim?: boolean }) {
  return (
    <div className={cn("transition-opacity duration-100", dim && "opacity-50")}>
      <table className="w-full text-12">
        <caption className="sr-only">Cost of one run, by looot endpoint</caption>
        <tbody>
          {quote.lines.map((l) => (
            <tr key={l.source} className="border-b border-line">
              <td className="num h-8 max-w-0 w-full truncate pr-2">
                {l.endpointId}
                {l.conditional ? <span className="ml-1 font-sans text-11 text-mute">only on a change</span> : null}
              </td>
              <td className="num h-8 whitespace-nowrap px-2 text-right text-mute">
                {l.calls} {l.calls === 1 ? "call" : "calls"}
              </td>
              <td className="num h-8 whitespace-nowrap pl-2 text-right">{usdPrecise(l.priceMicros)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2} className="h-8 text-left font-medium">
              Per run
            </th>
            <td className="num h-8 text-right font-medium">{usdPrecise(quote.perRunMicros)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
