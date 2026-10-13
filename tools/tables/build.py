"""Build tables.json from the hand-checked .spec files.

Spec format, one block per question:
  @@ KEY
  < exact flattened text to replace          (MC: substring of q)
  < L3-7                                      (Long Q: line range, 1-based)
  <+ exact text                               (keep the text, put the table after it)
  |# caption
  || header cell | header cell::2             (::N = colspan)
  | body cell | body cell
  = plain text that goes in the same place
  ! note (a note starting "digits:" waives the digit check)
Several "<" groups may follow each other in one block.
"""
import json, os, re, sys, collections

BANK = json.load(open(os.environ.get('BANK', '/mnt/project-files/question-bank/bank.json')))
Q = {}
for kind in ('mcq', 'lq'):
    for q in BANK[kind]:
        Q.setdefault(q['key'], (kind, q))


def h32(s):
    """djb2 over UTF-16 code units of the whitespace-collapsed text; app.html does the same."""
    s = re.sub(r'\s+', ' ', s).strip()
    h = 5381
    b = s.encode('utf-16-le')
    for i in range(0, len(b), 2):
        h = ((h * 33) ^ (b[i] | (b[i + 1] << 8))) & 0xffffffff
    return format(h, '08x')


def cell(c):
    c = c.strip()
    m = re.match(r'^(.*)::(\d+)$', c)
    return [m.group(1).strip(), int(m.group(2))] if m else c


def parse(path):
    out = collections.OrderedDict()
    cur = None
    for raw in open(path, encoding='utf-8').read().split('\n'):
        line = raw.rstrip('\n')
        if line.startswith('@@ '):
            key = line[3:].strip()
            cur = {'groups': [], 'notes': []}
            if key in out:
                sys.exit('duplicate block ' + key)
            out[key] = cur
            continue
        if cur is None or not line.strip() or line.startswith('#'):
            continue
        if line.startswith('<+ '):
            cur['groups'].append({'mode': 'after', 'span': line[3:], 'items': []})
        elif line.startswith('< '):
            cur['groups'].append({'mode': 'replace', 'span': line[2:], 'items': []})
        elif line.startswith('!'):
            cur['notes'].append(line[1:].strip())
        else:
            items = cur['groups'][-1]['items']
            if line.startswith('|#'):
                items.append({'c': line[2:].strip(), 'h': [], 'r': []})
            elif line.startswith('||') or line.startswith('|'):
                head = line.startswith('||')
                cells = [cell(c) for c in line[2 if head else 1:].split('|')]
                if not items or not isinstance(items[-1], dict) or (head and items[-1]['r']):
                    items.append({'h': [], 'r': []})
                items[-1]['h' if head else 'r'].append(cells)
            elif line.startswith('= '):
                items.append(line[2:])
            else:
                sys.exit('bad line in %s: %r' % (cur, line))
    return out


LABEL = re.compile(r'^(\([a-z]\)|\([ivx]+\)|\([IV]+\)|Source [A-Z0-9]+:|Table \d|Case \d|-|\*|#|@|Explain whether|Suppose|Refer|(An? [a-z]+|[A-Z][a-z]+):)')


def tidy_lq(text):
    """Long Q text came out of PDFs with hard line breaks and column padding.
    Rejoin wrapped lines, keep breaks before part labels and blank lines."""
    lines = [re.sub(r'\s{2,}', ' ', l).strip() for l in text.split('\n')]
    while lines and lines[-1] in ('', 'Marking Scheme'):
        lines.pop()
    out = []
    for l in lines:
        if not l:
            if out and out[-1] != '':
                out.append('')
        elif out and out[-1] != '' and (re.match(r'^\(\d+ marks?\)$', l) or not (
                LABEL.match(l) or re.match(r'^(Source [A-Z0-9]+|Table \d+):', out[-1]))):
            out[-1] += ('' if re.search(r'[a-z]-$', out[-1]) else ' ') + l
        else:
            out.append(l)
    return '\n'.join(out).strip()


def digits(x):
    if isinstance(x, int):
        return ''
    if isinstance(x, list):
        return ''.join(digits(i) for i in x)
    if isinstance(x, dict):
        return digits(x.get('c', '')) + digits(x['h']) + digits(x['r'])
    return re.sub(r'\D', '', x)


def build(specs):
    items, problems, report = {}, [], []
    for path in specs:
        for key, blk in parse(path).items():
            if key not in Q:
                problems.append(key + ': not in bank'); continue
            kind, q = Q[key]
            text = q['q']
            waive = any(n.startswith('digits:') for n in blk['notes'])
            # cut the stem into [text, group, text, group, ...]
            pieces = []
            if kind == 'lq' and blk['groups'] and re.match(r'^L\d+-\d+$', blk['groups'][0]['span']):
                lines = text.split('\n')
                pos = 0
                for g in blk['groups']:
                    a, b = map(int, g['span'][1:].split('-'))
                    if a - 1 < pos or b > len(lines):
                        problems.append('%s: bad range %s' % (key, g['span'])); break
                    pieces.append('\n'.join(lines[pos:a - 1]))
                    g['orig'] = '\n'.join(lines[a - 1:b])
                    pieces.append(g)
                    pos = b
                pieces.append('\n'.join(lines[pos:]))
            else:
                rest = text
                for g in blk['groups']:
                    i = rest.find(g['span'])
                    if i < 0:
                        problems.append('%s: span not found: %r' % (key, g['span'][:60])); break
                    j = i + len(g['span'])
                    if g['mode'] == 'after':
                        pieces.append(rest[:j]); g['orig'] = ''
                    else:
                        pieces.append(rest[:i]); g['orig'] = g['span']
                    pieces.append(g)
                    rest = rest[j:]
                pieces.append(rest)
            parts = []
            for p in pieces:
                if isinstance(p, dict):
                    if p['mode'] == 'replace' and not waive and digits(p['orig']) and \
                            sorted(digits(p['orig'])) != sorted(digits(p['items'])):
                        problems.append('%s: digits differ\n   was %s\n   now %s' % (
                            key, ''.join(sorted(digits(p['orig']))), ''.join(sorted(digits(p['items'])))))
                    for it in p['items']:
                        parts.append(it)
                else:
                    t = tidy_lq(p) if kind == 'lq' else p.strip()
                    if t:
                        parts.append(t)
            # merge neighbouring text parts
            merged = []
            for p in parts:
                if isinstance(p, str) and merged and isinstance(merged[-1], str):
                    merged[-1] += ('\n' if kind == 'lq' else ' ') + p
                else:
                    merged.append(p)
            items[key] = {'h': h32(text), 'p': merged}
            report.append({'key': key, 'kind': kind, 'page': q.get('_page'), 'orig': text,
                           'parts': merged, 'notes': blk['notes']})
    return items, problems, report


if __name__ == '__main__':
    specs = sys.argv[1:]
    items, problems, report = build(specs)
    for p in problems:
        print('PROBLEM', p)
    json.dump({'about': 'Past-paper tables rebuilt from flattened question text. Built by tools/tables/build.py from tables.spec; '
                        'app.html shows them in place of the flattened text when the question text still matches h.',
               'items': items}, open('tables.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(report, open('report.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(len(items), 'questions,', sum(1 for r in report if r['kind'] == 'mcq'), 'MC,',
          sum(1 for r in report if r['kind'] == 'lq'), 'LQ;', len(problems), 'problems')
