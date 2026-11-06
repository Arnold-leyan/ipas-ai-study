"""統計考古題「大家最常錯的題目」，產生 assets/data-hotwrong.js（給 hot-wrong.html 用）。

用法（在網站根目錄）：  py -3 -I tools/build-hotwrong.py

資料來源：讀書會網站後端 GET ?name=本名（每人一次），取每份考古題「最後一次交卷」的 detail
（每題選了哪個選項）。名單讀上一層的 ../參加名單.csv（本梯次 25 人；下一梯次、不列入統計的人不在裡面）。
輸出只有「每題各選項被選了幾次」，不含任何人的姓名——網站是公開的，不能放個人成績。

題目文字不重複存，hot-wrong.html 直接讀 data-exam.js；這裡只存統計。
改了題庫（重跑 extract-exams.py）或想更新統計時，重跑這支再跑 node tools/build-sw.js。
"""
import csv, json, os, re, subprocess, sys, urllib.parse, urllib.request
import concurrent.futures as cf
from datetime import date

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
THRESHOLD = 0.5   # 答錯率 >= 這個值的題目才收進來

def read_config_url():
    src = open(os.path.join(ROOT, 'assets', 'config.js'), encoding='utf-8').read()
    return re.search(r"var GAS_WEB_APP_URL = '([^']+)'", src).group(1)

def load_exams():
    js = ("const fs=require('fs'),vm=require('vm');const c={};vm.createContext(c);"
          "vm.runInContext(fs.readFileSync(process.argv[1],'utf8')+';this.E=EXAM_QUESTIONS',c);"
          "process.stdout.write(JSON.stringify(c.E))")
    out = subprocess.run(['node', '-e', js, os.path.join(ROOT, 'assets', 'data-exam.js')],
                         capture_output=True, check=True).stdout
    return json.loads(out.decode('utf-8'))

def main():
    url = read_config_url()
    exams = load_exams()
    roster = os.path.join(ROOT, '..', '參加名單.csv')
    names = [r['本名'] for r in csv.DictReader(open(roster, encoding='utf-8-sig'))]

    def get(n):
        err = None
        for _ in range(3):
            try:
                with urllib.request.urlopen(url + '?name=' + urllib.parse.quote(n), timeout=90) as r:
                    d = json.loads(r.read().decode('utf-8'))
                if d.get('status') == 'ok':
                    return n, d
            except Exception as e:
                err = e
        sys.exit('查詢失敗：%s（%s）' % (n, err))

    with cf.ThreadPoolExecutor(8) as ex:
        status = dict(ex.map(get, names))

    per_exam = {}
    people = set()
    items = []
    for key, ex in exams.items():
        hits = [(n, d['days'][key]) for n, d in status.items()
                if key in d['days'] and d['days'][key].get('detail')]
        per_exam[key] = len(hits)
        people.update(n for n, _ in hits)
        for i, q in enumerate(ex['questions']):
            picks = [0, 0, 0, 0]
            for _, h in hits:
                l = h['detail'].get('Q%d' % (i + 1), '-')
                if l in 'ABCD' and l:
                    picks[' ABCD'.index(l) - 1] += 1
            n = sum(picks)
            wrong = n - picks[q['a']]
            if n and wrong / n >= THRESHOLD:
                items.append({'k': key, 'i': i, 'n': n, 'w': wrong, 'p': picks})

    items.sort(key=lambda t: (-t['w'] / t['n'], -t['w'], -t['n'], t['k'], t['i']))
    data = {
        'generated': date.today().isoformat(),
        'people': len(people),
        'submissions': sum(per_exam.values()),
        'perExam': per_exam,
        'threshold': THRESHOLD,
        'items': items,
    }
    out = os.path.join(ROOT, 'assets', 'data-hotwrong.js')
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write('/* 由 tools/build-hotwrong.py 產生：考古題各題被選了幾次（p＝A～D 的選擇人數），不含姓名。 */\n')
        f.write('var HOTWRONG = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('%d 人、%d 份交卷、收進 %d 題（答錯率 >= %d%%）' % (len(people), data['submissions'], len(items), THRESHOLD * 100))
    print('每份交卷人數：', per_exam)

main()
