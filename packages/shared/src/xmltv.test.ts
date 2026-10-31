import { describe, expect, it } from 'vitest';
import { createXmltvParser, decodeEntities, parseXmltvDate, type XmltvChannel, type XmltvProgramme } from './xmltv';
import { generateXmltv } from './fixtures';

const parse = (text: string, step = text.length) => {
  const channels: XmltvChannel[] = [];
  const programmes: XmltvProgramme[] = [];
  const p = createXmltvParser({ onChannel: (c) => channels.push(c), onProgramme: (x) => programmes.push(x) });
  for (let i = 0; i < text.length; i += step) p.push(text.slice(i, i + step));
  p.end();
  return { channels, programmes };
};

describe('xmltv', () => {
  it('parses dates with time zones', () => {
    expect(parseXmltvDate('20240101120000 +0100')).toBe(Date.UTC(2024, 0, 1, 11, 0, 0));
    expect(parseXmltvDate('20240101120000 -0230')).toBe(Date.UTC(2024, 0, 1, 14, 30, 0));
    expect(parseXmltvDate('20240101120000')).toBe(Date.UTC(2024, 0, 1, 12, 0, 0));
    expect(parseXmltvDate('nope')).toBeNaN();
  });

  it('decodes entities', () => {
    expect(decodeEntities('Tom &amp; Jerry &#233;t&#xE9; &quot;x&quot;')).toBe('Tom & Jerry été "x"');
  });

  it('parses channels and programmes, preferring French titles', () => {
    const xml = `<?xml version="1.0"?><tv>
      <channel id="tf1.fr"><display-name>TF1</display-name><display-name>TF1 HD</display-name></channel>
      <programme start="20240101200000 +0000" stop="20240101210000 +0000" channel="tf1.fr">
        <title lang="en">News</title><title lang="fr">Journal &amp; météo</title>
        <desc lang="fr"><![CDATA[Le <b>journal</b>]]></desc>
      </programme>
      <programme start="bad" stop="20240101210000 +0000" channel="tf1.fr"><title>Ignored</title></programme>
    </tv>`;
    const { channels, programmes } = parse(xml, 7);
    expect(channels).toEqual([{ id: 'tf1.fr', names: ['TF1', 'TF1 HD'] }]);
    expect(programmes).toEqual([
      {
        channel: 'tf1.fr',
        start: Date.UTC(2024, 0, 1, 20),
        stop: Date.UTC(2024, 0, 1, 21),
        title: 'Journal & météo',
        desc: 'Le <b>journal</b>',
      },
    ]);
  });

  it('streams a large guide at arbitrary chunk boundaries', () => {
    const xml = generateXmltv({ channels: 200, hours: 48, start: Date.UTC(2024, 0, 1) });
    const { channels, programmes } = parse(xml, 4093);
    expect(channels).toHaveLength(200);
    expect(programmes).toHaveLength(200 * 48 * 2);
    expect(programmes[programmes.length - 1]!.channel).toBe('ch199.fr');
  });
});
