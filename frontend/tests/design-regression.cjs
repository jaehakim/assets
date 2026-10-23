const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:18082';
const output = process.env.TEST_OUTPUT || '/tmp/assetflow-design-tests';
fs.mkdirSync(output,{recursive:true});
const id='11111111-1111-4111-8111-111111111111';
const now=new Date().toISOString();
const assets=[{id,hostname:'PC-REVIEW-01',username:'디자인검증',department:'운영팀',last_seen_at:now,online:true,bitlocker_enabled:false,antivirus_status:'Healthy',lifecycle_status:'IN_USE',os_name:'Windows 11',serial_no:'SERIAL-01'},{id:'22222222-2222-4222-8222-222222222222',hostname:'PC-HEALTHY-02',username:'담당자',last_seen_at:now,online:true,bitlocker_enabled:true,antivirus_status:'Healthy',lifecycle_status:'IN_USE'}];
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);
 let empty=true,failData=false,failMonitor=false,failDetail=false,loggedIn=true;
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 let saved=false;
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;let data=[];
  if(path.endsWith('/auth/me')){if(!loggedIn)return route.fulfill({status:401,body:''});data={username:'design-review'};}
  else if(path.endsWith('/auth/logout')){loggedIn=false;data={};}
  else if(path.endsWith('/dashboard')){if(failData)return route.fulfill({status:503,body:'Test unavailable'});data={total:empty?0:2,online:empty?0:2,offline:0,stale:0,security:{bitlocker:empty?0:1,antivirus:0},management:{}};}
  else if(path.endsWith('/assets'))data=empty?[]:assets;
  else if(path.endsWith('/management')){saved=true;data={status:'updated'};}
  else if(path.endsWith('/assets/'+id)){if(failDetail)return route.fulfill({status:503,body:'Test detail error'});data={...assets[0],disks:[],software:[],managementHistory:[],firewall_enabled:true};}
  else if(path.endsWith('/system-inspections/live')){if(failMonitor)return route.fulfill({status:503,body:'Test monitor error'});data={nodeReady:true,diskPressure:false,podReady:5,podTotal:5,backendReady:2,frontendReady:2,nodeName:'test-node',database:'OK',checkedAt:now,cpuUsage:'5%',memoryUsage:'1 Gi (10%)',platform:'k3s'};}
  else if(path.endsWith('/software-compliance/sync'))data={status:'OK',importedCount:3};
  else if(path.endsWith('/software-compliance'))data={policies:[],detections:[],syncLogs:[],affectedAssets:0};
  await route.fulfill({json:data});
 });
 const checks=[];const check=(name)=>{checks.push(name);console.log('PASS '+name)};
 await page.goto(base,{waitUntil:'networkidle'});
 await page.getByText('측정 대상 없음',{exact:true}).waitFor();assert.equal(await page.getByText('100%',{exact:true}).count(),0);check('Empty assets are unmeasured, never 100%');
 failData=true;await page.getByRole('button',{name:/새로고침/}).click();await page.getByRole('alert').filter({hasText:'불러오지 못했습니다'}).waitFor();check('Dashboard failure is visible');
 empty=false;failData=false;await page.getByRole('button',{name:'다시 시도',exact:true}).click();await page.getByText('75%',{exact:true}).waitFor();check('Retry recovers data and compliance');
 await page.getByRole('button',{name:/디스크 암호화/}).click();await page.getByRole('heading',{name:'자산 목록'}).waitFor();assert.equal(await page.getByLabel('조치 상태').inputValue(),'bitlocker');assert.equal(await page.getByRole('button',{name:'PC-HEALTHY-02 상세 보기'}).count(),0);check('Action opens filtered asset list');
 const search=page.getByRole('textbox',{name:'장비·사용자·부서 검색'});assert.equal(await search.count(),1);await search.fill('missing');await page.getByRole('button',{name:'필터 초기화',exact:true}).click();assert.equal(await search.inputValue(),'');assert.equal(await page.getByLabel('조치 상태').inputValue(),'all');await page.getByRole('button',{name:'PC-HEALTHY-02 상세 보기'}).waitFor();check('One search and complete filter reset');
 await search.fill('PC-REVIEW');await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByRole('textbox',{name:'장비·사용자·부서 검색'}).inputValue(),'PC-REVIEW');check('URL restores workspace and search');
 const detail=page.getByRole('button',{name:'PC-REVIEW-01 상세 보기'});await detail.focus();await page.keyboard.press('Enter');await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'관리·이력',exact:true}).click();await page.getByLabel('자산 태그',{exact:true}).waitFor();assert(await page.evaluate(()=>document.querySelector('[role=dialog]').contains(document.activeElement)));assert(await page.locator('main').evaluate(el=>el.inert));
 await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.querySelector('[role=dialog]').contains(document.activeElement)));await page.getByRole('button',{name:'상세정보 닫기'}).focus();await page.keyboard.press('Shift+Tab');assert(await page.evaluate(()=>document.querySelector('[role=dialog]').contains(document.activeElement)));check('Detail keyboard entry, focus containment, background inert');
 await page.getByLabel('자산 태그',{exact:true}).fill('TEST');page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'상세정보 닫기'}).click();assert.equal(await page.getByRole('dialog').count(),1);check('Unsaved changes protected');
 await page.getByRole('button',{name:'관리 정보 저장'}).click();await page.getByText('관리 정보가 저장되었습니다.',{exact:true}).waitFor();assert(saved);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'PC-REVIEW-01 상세 보기');check('Save feedback and focus return');
 for(const name of ['Agent 배포','업데이트 이력','SW 컴플라이언스','시스템 가이드','점검 일지']){await page.locator('aside').getByRole('button',{name,exact:true}).click();await page.waitForTimeout(300);check('View renders: '+name);}
 await page.locator('aside').getByRole('button',{name:'SW 컴플라이언스',exact:true}).click();await page.getByRole('button',{name:/공공 기초자료 동기화/}).click();await page.getByRole('status').filter({hasText:'3건을 동기화했습니다.'}).waitFor();check('Sync result survives reload');
 await page.locator('aside').getByRole('button',{name:'서버 모니터링',exact:true}).click();await page.locator('.monitor-actions').getByText('정상',{exact:true}).waitFor();failMonitor=true;await page.getByRole('button',{name:/즉시 갱신/}).click();await page.getByText('갱신 실패 · 상태 미확인',{exact:true}).waitFor();check('Stale monitor no longer shows normal');
 await page.locator('aside').getByRole('button',{name:'대시보드',exact:true}).click();
 for(const width of [1440,1280,768,390]){await page.setViewportSize({width,height:900});await page.waitForTimeout(250);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`${output}/dashboard-${width}.png`,fullPage:true});check('No page overflow at '+width);}
 await page.getByRole('button',{name:'전체 메뉴',exact:true}).click();await page.locator('aside').getByRole('button',{name:'자산 관리',exact:true}).click();assert.equal(await page.locator('aside').isVisible(),false);await page.getByRole('heading',{name:'자산 목록'}).waitFor();check('Mobile can navigate unopened workspaces');
 await page.getByRole('button',{name:'전체 메뉴',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'전체 메뉴'}).evaluate(el=>el===document.activeElement),true);check('Mobile menu Escape returns focus');
 await page.getByRole('button',{name:'전체 메뉴',exact:true}).click();await page.locator('aside').getByRole('button',{name:'로그아웃',exact:true}).click();await page.getByRole('heading',{name:'IT 운영 관리자 접속'}).waitFor();await page.screenshot({path:`${output}/login-390.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));check('Mobile logout and login layout');
 assert.deepEqual(errors,[]);check('No JavaScript page errors');
 fs.writeFileSync(`${output}/results.json`,JSON.stringify({base,checks,errors},null,2));await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
