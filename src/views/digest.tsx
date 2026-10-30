import type { DigestRow, Night } from '../digest/types.js';

const dash = '—';

// Retries of 3 or more, or any fail, are marked; the mark is text, not only color.
function flags(row: DigestRow): string[] {
  const out: string[] = [];
  if (row.retries >= 3) out.push('many retries');
  if (row.fail > 0) out.push('fail');
  return out;
}

export function DigestPage({ night }: { night: Night }) {
  return (
    <>
      <h1>digest {night.night}</h1>
      {night.badLines > 0 && (
        <p class="warn">
          {night.badLines} {night.badLines === 1 ? "line didn't" : "lines didn't"} parse
        </p>
      )}
      {night.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {night.rows.map((r) => {
              const marks = flags(r);
              return (
                <tr class={marks.length > 0 ? 'warn' : undefined}>
                  <td>
                    {r.job}
                    {marks.length > 0 && <> [{marks.join(', ')}]</>}
                  </td>
                  <td>{r.owner ?? dash}</td>
                  <td>{r.runs}</td>
                  <td>{r.retries}</td>
                  <td>{r.lastStatus}</td>
                  <td>{r.lastError ?? dash}</td>
                  <td>{r.firstAt}</td>
                  <td>{r.lastAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

export function DigestNotFound({ night }: { night: string }) {
  return (
    <>
      <h1>digest {night}</h1>
      <p class="warn">no run log for this night</p>
    </>
  );
}
