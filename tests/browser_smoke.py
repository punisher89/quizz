from pathlib import Path
from threading import Thread
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
html=html.replace('<link rel="icon" href="assets/icon.svg"><link rel="stylesheet" href="styles.css">', '<style>'+(root/'styles.css').read_text()+'</style>')
for script in ['src/questions.js','src/showdata.js','src/showlogic.js','src/app.js']:
    html=html.replace(f'<script src="{script}" defer></script>','')
html=html.replace('</body>', ''.join('<script>'+(root/script).read_text()+'</script>' for script in ['src/questions.js','src/showdata.js','src/showlogic.js','src/app.js'])+'</body>')
(root/'.qa').mkdir(exist_ok=True)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  page=browser.new_page(viewport={'width':1440,'height':960},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html,wait_until='load');page.wait_for_timeout(150)
  assert page.locator('main#menu').is_visible()
  page.screenshot(path=str(root/'.qa/menu.png'),full_page=True)
  page.locator('[data-count="1"]').click();page.locator('[data-time="0"]').click();page.locator('#start').click()
  assert page.locator('main#play').is_visible()
  assert 'БЛИЦ-СТАРТ' in page.locator('#round-name').inner_text()
  page.screenshot(path=str(root/'.qa/intro.png'),full_page=True)
  page.locator('[data-action="continue"]').click()
  assert page.locator('.answer-tile').count()==4
  page.screenshot(path=str(root/'.qa/question.png'),full_page=True)
  page.locator('[data-choice="0"]').click()
  assert 'Результаты' in page.locator('#headline').inner_text()
  page.screenshot(path=str(root/'.qa/reveal.png'),full_page=True)
  page.locator('[data-action="continue"]').click()
  assert page.locator('.answer-tile').count()==4
  # Finish quickstarter round
  for i in range(4):
   page.locator('[data-choice="0"]').click()
   assert 'Результаты' in page.locator('#headline').inner_text()
   page.locator('[data-action="continue"]').click()
  assert 'Раунд завершён' in page.locator('#headline').inner_text()
  page.locator('[data-action="continue"]').click()
  assert 'ВЫБЕРИ ТЕМУ' in page.locator('#round-name').inner_text()
  page.locator('[data-action="continue"]').click()
  assert page.locator('.category-choice').count()==6
  page.locator('[data-category="2"]').click()
  assert page.locator('.answer-tile').count()==4
  page.locator('[data-choice="0"]').click()
  assert 'Результаты' in page.locator('#headline').inner_text()
  print('Browser stages: menu, quick, reveal, round transition, category choice => PASS')
  seen={'БЛИЦ-СТАРТ'}; steps=0
  while steps<170 and 'Победитель шоу!' not in page.locator('#headline').inner_text():
   heading=page.locator('#round-name').inner_text();seen.add(heading)
   if page.locator('[data-action="continue"]').count(): page.locator('[data-action="continue"]').click()
   elif page.locator('.category-choice').count(): page.locator('.category-choice').first.click()
   elif page.locator('.answer-tile:not([disabled])').count(): page.locator('.answer-tile:not([disabled])').first.click()
   else: raise RuntimeError('Unexpected stage '+page.locator('#headline').inner_text())
   steps+=1
  assert 'Победитель шоу!' in page.locator('#headline').inner_text(),page.locator('#headline').inner_text()
  assert {'БЛИЦ-СТАРТ','ВЫБЕРИ ТЕМУ','БЛИЖЕ К ЦЕЛИ','СОБЕРИ ОТВЕТЫ','ФИНАЛЬНЫЙ СПРИНТ'}.issubset(seen),seen
  page.screenshot(path=str(root/'.qa/winner.png'),full_page=True)
  print('Full match: all 5 round modes, final and winner => PASS; actions',steps)
  assert not errors,errors
  # fake gamepad test using second tab
  padpage=browser.new_page(viewport={'width':1300,'height':900})
  padpage.set_content(html,wait_until='load')
  padpage.evaluate('''() => { window.__fakePad={index:0,connected:true,id:'Fake Pad',mapping:'standard',axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))}; Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.__fakePad]});}''')
  def press(n):
   padpage.evaluate('(n)=>window.__fakePad.buttons[n].pressed=true',n)
   padpage.wait_for_timeout(100)
   padpage.evaluate('(n)=>window.__fakePad.buttons[n].pressed=false',n)
   padpage.wait_for_timeout(100)
  padpage.locator('[data-count="1"]').click()
  press(9) # Options in menu is ignored; A starts from menu default focus
  press(0)
  assert padpage.locator('main#play').is_visible()
  press(0)
  assert padpage.locator('.answer-tile').count()==4
  press(13)
  assert 'focused' in padpage.locator('[data-choice="2"]').get_attribute('class')
  press(0)
  assert 'Результаты' in padpage.locator('#headline').inner_text()
  press(9)
  assert padpage.locator('#pause').is_visible()
  press(9)
  assert not padpage.locator('#pause').is_visible()
  print('Gamepad simulation: start, navigate, submit, pause => PASS')
  assert not errors,errors
  browser.close()
finally:
 pass
