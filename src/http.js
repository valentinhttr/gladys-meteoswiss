import { Readable } from 'node:stream';
import { parse } from 'csv-parse';

// All remote URLs, including STAC pagination and asset links, stay on the official host.
export function officialUrl(url) {
  const parsed = new URL(url);
  if (parsed.origin !== 'https://data.geo.admin.ch' || parsed.username || parsed.password) {
    throw new Error('Unexpected MeteoSwiss data URL');
  }
  return parsed.href;
}

export class OpenDataHttp {
  constructor({ fetchImpl = fetch, signal } = {}) {
    this.fetch = fetchImpl;
    this.signal = signal;
  }

  async response(url) {
    const signals = [AbortSignal.timeout(90_000)];
    if (this.signal) signals.push(this.signal);
    const response = await this.fetch(officialUrl(url), {
      signal: AbortSignal.any(signals),
      redirect: 'error',
      headers: { 'User-Agent': 'gladys-meteoswiss/1.0 (MeteoSwiss Open Data)' },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`MeteoSwiss HTTP ${response.status}`);
    }
    return response;
  }

  async json(url) {
    const response = await this.response(url);
    const text = await response.text();
    if (text.length > 16_000_000) throw new Error('STAC response too large');
    return JSON.parse(text);
  }

  async csv(url, onRow) {
    const response = await this.response(url);
    const source = Readable.fromWeb(response.body);
    const parser = parse({
      delimiter: ';',
      columns: true,
      bom: true,
      encoding: 'latin1',
      skip_empty_lines: true,
      max_record_size: 16_384,
    });
    // Forward network failures; pipe alone would leave the parser waiting forever.
    source.on('error', (error) => parser.destroy(error));
    source.pipe(parser);
    try {
      for await (const row of parser) onRow(row);
    } finally {
      source.destroy();
      parser.destroy();
    }
  }
}
