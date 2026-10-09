import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenDataHttp, officialUrl } from '../src/http.js';
import { Locations, coordinatesValid } from '../src/locations.js';

test('streaming CSV handles Latin-1 accents, quoted separators and split chunks', async () => {
  const raw = Buffer.from(
    'name;value\r\n"Genève; centre";1\r\n"A ""quoted"" name";2\r\n',
    'latin1',
  );
  const body = new ReadableStream({
    start(controller) {
      for (let i = 0; i < raw.length; i += 3) controller.enqueue(raw.subarray(i, i + 3));
      controller.close();
    },
  });
  const http = new OpenDataHttp({ fetchImpl: async () => new Response(body) });
  const rows = [];
  await http.csv('https://data.geo.admin.ch/test.csv', (row) => rows.push(row));
  assert.deepEqual(rows, [
    { name: 'Genève; centre', value: '1' },
    { name: 'A "quoted" name', value: '2' },
  ]);
});

test('CSV network interruption rejects rather than hanging', async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(Buffer.from('a;b\n'));
      controller.error(new Error('network lost'));
    },
  });
  const http = new OpenDataHttp({ fetchImpl: async () => new Response(body) });
  await assert.rejects(
    http.csv('https://data.geo.admin.ch/test.csv', () => {}),
    /network lost/,
  );
});

test('HTTP failures are propagated and remote URLs cannot redirect to other hosts', async () => {
  const http = new OpenDataHttp({
    fetchImpl: async (_, options) => {
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal);
      return new Response('', { status: 503 });
    },
  });
  await assert.rejects(http.json('https://data.geo.admin.ch/test'), /HTTP 503/);
  for (const url of [
    'http://data.geo.admin.ch/a',
    'https://example.org',
    'https://user@data.geo.admin.ch/a',
  ]) {
    assert.throws(() => officialUrl(url), /Unexpected/);
  }
});

test('nearest locality ignores stations/summits, rejects far-away and absent coordinates', async () => {
  let downloads = 0;
  const locations = new Locations({
    async csv(_, row) {
      downloads++;
      row({
        point_id: '1',
        point_type_id: '3',
        point_name: 'Summit',
        point_coordinates_wgs84_lat: '46.52',
        point_coordinates_wgs84_lon: '6.63',
      });
      row({
        point_id: '2',
        point_type_id: '2',
        point_name: 'Lausanne',
        point_coordinates_wgs84_lat: '46.5197',
        point_coordinates_wgs84_lon: '6.6323',
      });
    },
  });
  const [a, b] = await Promise.all([
    locations.nearest(46.52, 6.63),
    locations.nearest(46.52, 6.63),
  ]);
  assert.equal(a.name, 'Lausanne');
  assert.equal(a, b);
  assert.equal(downloads, 1);
  await assert.rejects(locations.nearest(48.8566, 2.3522), /outside/);
  await assert.rejects(locations.nearest(null, null), /noHouse/);
  assert.equal(coordinatesValid('46', '6'), false);
  assert.equal(coordinatesValid(NaN, 6), false);
});

test('failed metadata download can recover', async () => {
  let calls = 0;
  const locations = new Locations({
    async csv(_, row) {
      if (++calls === 1) throw new Error('offline');
      row({
        point_id: '2',
        point_type_id: '2',
        point_name: 'Lausanne',
        point_coordinates_wgs84_lat: '46.52',
        point_coordinates_wgs84_lon: '6.63',
      });
    },
  });
  await assert.rejects(locations.load(), /offline/);
  assert.equal((await locations.load()).length, 1);
});
