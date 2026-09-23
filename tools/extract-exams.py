"""把 ../考古題 裡的 iPAS 官方公告試題 PDF 轉成 assets/data-exam.js。

考古題頁（exam-*.html）與考古題錯題複習頁都直接讀 data-exam.js，
題目只存這一份，不寫死在 HTML 裡。之後 iPAS 公告新一次的試題：
  1. 把 PDF 放進 考古題 資料夾
  2. 在下面的 SITTINGS 加一筆
  3. 從網站根目錄執行  python tools/extract-exams.py
需要 PyMuPDF（pip install pymupdf）。

解析方式：PDF 每一頁是「答案｜題目」兩欄的表格，抽出文字後
「單一字母 A–D」緊接「N.」就是一題的開頭，(A)～(D) 開頭的行是選項。
答案另外用字的座標再比對一次（左欄字母對齊題號那一列），兩種方法不一致就中止。
"""
import glob
import json
import os
import re
import sys

import pymupdf

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(os.path.dirname(SITE), '考古題')

# key 前綴、PDF 檔名要包含的字、顯示名稱、考試日期
SITTINGS = [
    ('exam114-4', '114年第四梯次', '114 年第四次', '114/11/01'),
    ('exam115-1', '115年第一次', '115 年第一次', '115/03/21'),
    ('exam115-2', '115年第二次', '115 年第二次', '115/05/16'),
]
SUBJECTS = {1: ('第一科', '科目一', '人工智慧基礎概論'),
            2: ('第二科', '科目二', '生成式AI應用與規劃')}

FW = str.maketrans('ＡＢＣＤ', 'ABCD')
LIST = re.compile(r'^(\d+\.\s*\S|[（(][甲乙丙丁戊己][）)]|[①②③④⑤⑥⑦⑧⑨⑩]|[甲乙丙丁戊]、)')


def is_header(line):
    s = line.strip()
    return bool(re.search(r'AI ?應用規劃師-初級能力鑑定', s) or re.match(r'^第[一二]科：', s)
                or s.startswith('考試日期') or re.match(r'^第 ?\d+ ?頁，共', s)
                or s in ('答案', '題目', '題    目', '一、選擇題', ''))


def join(parts):
    """把 PDF 斷行接回去：中文直接接，英數之間補空格，條列項目（1. / （甲） / ①）保留換行。"""
    out = ''
    in_list = False
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if out and LIST.match(p):
            out += '\n' + p
            in_list = True
        elif out and in_list and re.match(r'^(請問|下列|依據|根據|若|在此)', p):
            out += '\n' + p
            in_list = False
        elif out and re.match(r'[A-Za-z0-9]', p[0]) and re.search(r'[A-Za-z0-9.,)）]$', out) and not out.endswith('-'):
            out += ' ' + p
        else:
            out += p
    return out


def parse_text(doc):
    lines = '\n'.join(p.get_text() for p in doc).split('\n')
    lines = [l for l in lines if not is_header(l)]
    qs, cur, i = [], None, 0
    while i < len(lines):
        s = lines[i].strip()
        nxt = lines[i + 1].strip() if i + 1 < len(lines) else ''
        m_num = re.match(r'^(\d+)\.\s*(.*)$', nxt)
        if re.match(r'^[A-DＡ-Ｄ]$', s) and m_num:
            cur = {'n': int(m_num.group(1)), 'ans': s.translate(FW), 'stem': [m_num.group(2)], 'opts': []}
            qs.append(cur)
            i += 2
            continue
        m_opt = re.match(r'^[(（]([A-DＡ-Ｄ])[)）](.*)$', s)
        if cur is not None and m_opt and len(cur['opts']) == 'ABCD'.index(m_opt.group(1).translate(FW)):
            cur['opts'].append([m_opt.group(2)])
        elif cur is not None:
            (cur['opts'][-1] if cur['opts'] else cur['stem']).append(s)
        i += 1
    return qs


def answers_by_position(doc):
    found = {}
    for page in doc:
        words = page.get_text('words')
        letters = [(w[1], w[4].translate(FW)) for w in words
                   if w[0] < 100 and re.fullmatch(r'[A-DＡ-Ｄ]', w[4])]
        for w in words:
            if w[0] < 140 and re.fullmatch(r'\d+\.', w[4]) and letters:
                n = int(w[4][:-1])
                dist, letter = min((abs(y - w[1]), l) for y, l in letters)
                if dist < 40 and n not in found:
                    found[n] = letter
    return found


def build(path):
    doc = pymupdf.open(path)
    raw = parse_text(doc)
    pos = answers_by_position(doc)
    if [q['n'] for q in raw] != list(range(1, 51)):
        sys.exit('題號不是 1～50：' + path)
    out = []
    for q in raw:
        opts = [re.sub(r'[；;]\s*$', '', join(o)) for o in q['opts']]
        if len(opts) != 4 or not all(opts):
            sys.exit(f'第 {q["n"]} 題選項不是四個：{path}')
        if pos.get(q['n']) != q['ans']:
            sys.exit(f'第 {q["n"]} 題答案兩種方法不一致（{q["ans"]} / {pos.get(q["n"])}）：{path}')
        out.append({'q': join(q['stem']), 'o': opts, 'a': 'ABCD'.index(q['ans'])})
    return out


data = {}
for key, fname_part, label, date in SITTINGS:
    for n, (pdf_word, short, full) in SUBJECTS.items():
        hits = [f for f in glob.glob(os.path.join(SRC, '*.pdf'))
                if fname_part in os.path.basename(f) and pdf_word in os.path.basename(f)]
        if len(hits) != 1:
            sys.exit(f'找不到（或找到多份）{label} {short} 的 PDF')
        k = f'{key}-{n}'
        data[k] = {
            'dayTitle': f'考古題 {label} {short}',
            'sitting': label,
            'date': date,
            'subject': f'{short}「{full}」',
            'source': os.path.basename(hits[0]),
            'questions': build(hits[0]),
        }
        print(k, len(data[k]['questions']), '題')

js = ('/* 自動從 iPAS 官方公告試題 PDF（../考古題）抽出，考古題頁與考古題錯題複習頁共用。\n'
      ' * 官方公告只有題目與答案，沒有解析，所以題目沒有 e 欄位。\n'
      ' * 不要手動改這裡——從網站根目錄執行  python tools/extract-exams.py  重新產生。 */\n'
      'var EXAM_QUESTIONS = ' + json.dumps(data, ensure_ascii=False, indent=1) + ';\n')
with open(os.path.join(SITE, 'assets', 'data-exam.js'), 'w', encoding='utf-8', newline='\n') as f:
    f.write(js)
print('wrote assets/data-exam.js')
