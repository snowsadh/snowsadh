// Selected option 3: 26 completed weeks; annual contributions centred, lifetime stars.
// Run with an authenticated `gh` CLI, or GH_TOKEN inside GitHub Actions.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const username = process.env.GITHUB_REPOSITORY_OWNER || 'snowsadh';
const repo = path.resolve(__dirname, '..');
const query = `query($login:String!,$from:DateTime!,$to:DateTime!,$endCursor:String){
  user(login:$login){contributionsCollection(from:$from,to:$to){
    totalPullRequestContributions
    contributionCalendar{weeks{contributionDays{date contributionCount}}}
  }
  repositories(first:100,after:$endCursor,ownerAffiliations:OWNER,privacy:PUBLIC,isFork:false){
    nodes{stargazerCount} pageInfo{hasNextPage endCursor}
  }}
}`;
const isoDay = date => date.toISOString().slice(0, 10);
const labelDate = day => new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
});
const escape = value => String(value).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
}[c]));

function render(collection, now, compact) {
  const today = isoDay(now);
  const days = collection.contributionCalendar.weeks.flatMap(w => w.contributionDays)
    .filter(d => d.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  assert(days.length >= 365, 'Expected 365 dated contribution counts');
  days.forEach((d, i) => {
    assert(Number.isSafeInteger(d.contributionCount) && d.contributionCount >= 0);
    if(i) assert.equal(Date.parse(d.date) - Date.parse(days[i - 1].date), 86400000);
  });
  assert.equal(days.at(-1).date, today, 'GitHub calendar is missing today');
  const annualDays = days.slice(-365);
  const annualContributions = annualDays.reduce((sum,d) => sum + d.contributionCount, 0);
  const weeks = collection.contributionCalendar.weeks
    .map(w => w.contributionDays.filter(d => d.date < today))
    .filter(w => w.length === 7 && new Date(w[0].date + 'T00:00:00Z').getUTCDay() === 0)
    .slice(-26).map(w => ({date:w[0].date, end:w[6].date,
      count:w.reduce((sum,d) => sum + d.contributionCount, 0)}));
  assert.equal(weeks.length, 26, 'Expected 26 completed Sunday–Saturday weeks');
  weeks.forEach((w,i) => {
    assert.equal(Date.parse(w.end)-Date.parse(w.date),6*86400000);
    if(i) assert.equal(Date.parse(w.date)-Date.parse(weeks[i-1].date),7*86400000);
  });
  const metrics = [
    [collection.totalPullRequestContributions, 'pull requests'],
    [annualContributions, 'contributions'],
    [collection.starsEarned, 'stars earned']
  ];
  metrics.forEach(([value]) => assert(Number.isSafeInteger(value) && value >= 0));
  const width = compact ? 360 : 900, height = compact ? 242 : 258;
  const left = compact ? 28 : 30, right = width - (compact ? 10 : 16), top = 18, bottom = compact ? 121 : 137;
  const max = Math.max(5, Math.ceil(Math.max(...weeks.map(w => w.count)) / 10) * 10);
  const point = (w, i) => [left + i * (right - left) / 25, bottom - w.count / max * (bottom - top)];
  const total = weeks.reduce((sum, w) => sum + w.count, 0);
  let content = '';
  for (const value of [0, max / 2, max]) {
    const y = bottom - value / max * (bottom - top);
    content += `<path d="M${left} ${y}H${right}" class="grid"/>
      <text x="${left - 12}" y="${y + 4}" text-anchor="end" class="axis">${value}</text>`;
  }
  content += `<polyline points="${weeks.map((w,i) => point(w,i).map(n => n.toFixed(2)).join(',')).join(' ')}" fill="none" stroke="#92c5ce" stroke-width="1.6"/>`;
  weeks.forEach((w,i) => {
    const [x,y] = point(w,i);
    content += `<rect x="${(x-1.7).toFixed(2)}" y="${(y-1.7).toFixed(2)}" width="3.4" height="3.4" fill="#92c5ce"><title>${w.date} to ${w.end}: ${w.count} contributions</title></rect>`;
  });
  content += `<text x="${left}" y="${bottom+22}" class="axis">${labelDate(weeks[0].date)}</text>
    <text x="${right}" y="${bottom+22}" text-anchor="end" class="axis">${labelDate(weeks.at(-1).end)}</text>`;
  metrics.forEach(([value, label], i) => {
    const x = width * (i + 0.5) / 3, y = bottom + 72;
    content += `<text x="${x}" y="${y}" text-anchor="middle" class="number">${value.toLocaleString('en-US')}</text>
      <text x="${x}" y="${y+23}" text-anchor="middle" class="${compact ? 'axis' : 'small'}">${label}</text>`;
  });
  const metricStart = isoDay(new Date(now - 365*86400000));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escape(username)} weekly GitHub contributions</title>
  <desc id="desc">${total} contributions in 26 completed Sunday–Saturday weeks, ${weeks[0].date} through ${weeks.at(-1).end}. Each point is one weekly total, including zero weeks. ${collection.totalPullRequestContributions} pull requests from ${metricStart} through ${today}. ${annualContributions} contributions across 365 calendar days, ${annualDays[0].date} through ${today}. ${collection.starsEarned} lifetime stars earned on owned public non-fork repositories. Updated ${labelDate(today)}.</desc>
  <style>text{font-family:Arial,Helvetica,sans-serif}.small{font-family:monospace;font-size:12px;fill:#8ca1b2}.axis{font-family:monospace;font-size:11px;fill:#829aab}.number{font-size:25px;fill:#93b2ce}.grid{fill:none;stroke:#273641;stroke-width:1}</style>
  ${content}
</svg>\n`;
}

function selfTest() {
  const now = new Date('2026-10-20T12:00:00Z');
  const contributionDays = Array.from({length:365}, (_,i) => ({
    date: isoDay(new Date(now - (364-i)*86400000)), contributionCount: i === 345 ? 9 : i === 5 ? 955 : 0
  }));
  const weeks = [];
  contributionDays.forEach(d => {
    if(!weeks.length || new Date(d.date+'T00:00:00Z').getUTCDay() === 0) weeks.push({contributionDays:[]});
    weeks.at(-1).contributionDays.push(d);
  });
  const sample = {totalPullRequestContributions:37,starsEarned:24,contributionCalendar:{weeks}};
  for(const compact of [false,true]) {
    const svg = render(sample,now,compact);
    assert(svg.includes('9 contributions in 26 completed'));
    assert.equal((svg.match(/<rect /g)||[]).length,26);
    assert.equal(svg.match(/<polyline points="([^"]+)"/)[1].split(' ').length,26);
    const visibleText=[...svg.matchAll(/<text\b[^>]*>([^<]+)<\/text>/g)].map(m=>m[1]);
    assert.deepEqual(visibleText.slice(-6),['37','pull requests','964','contributions','24','stars earned']);
    assert(!visibleText.some(t=>/months|activity|completed weeks/.test(t)));
    assert(svg.includes(`x="${(compact?360:900)/2}" y="${compact?193:209}" text-anchor="middle" class="number">964`));
    assert(!/NaN|Infinity|undefined/.test(svg));
    const cleared=weeks.map(w=>({contributionDays:w.contributionDays.map(d=>({...d,contributionCount:0}))}));
    assert(render({...sample,contributionCalendar:{weeks:cleared}},now,compact).includes('0 contributions'));
    const currentWeekSpike=cleared.map(w=>({contributionDays:w.contributionDays.map(d=>({...d,contributionCount:d.date===isoDay(now)?99:0}))}));
    assert(render({...sample,contributionCalendar:{weeks:currentWeekSpike}},now,compact).includes('0 contributions in 26 completed'));
  }
  assert.throws(()=>render({...sample,totalPullRequestContributions:-1},now,false));
  assert.throws(()=>render({...sample,starsEarned:-1},now,false));
  console.log('Stats renderer self-test passed.');
}

if(process.argv.includes('--self-test')) selfTest();
else {
  const now = new Date(), from = new Date(now - 365*86400000);
  const pages = JSON.parse(execFileSync('gh', ['api','graphql','--paginate','--slurp',
    '-f',`query=${query}`,'-f',`login=${username}`,
    '-f',`from=${from.toISOString()}`,'-f',`to=${now.toISOString()}`
  ], {encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024}));
  assert(pages.length && pages.every(p => !p.errors && p.data?.user?.contributionsCollection && p.data.user.repositories), 'GitHub did not return complete stats');
  const repositories = pages.flatMap(p => p.data.user.repositories.nodes);
  repositories.forEach(r => assert(Number.isSafeInteger(r.stargazerCount) && r.stargazerCount >= 0));
  assert.equal(pages.at(-1).data.user.repositories.pageInfo.hasNextPage,false);
  const data = {...pages[0].data.user.contributionsCollection,
    starsEarned:repositories.reduce((sum,r) => sum + r.stargazerCount, 0)};
  const images = [render(data,now,false),render(data,now,true)];
  fs.mkdirSync(path.join(repo,'assets'),{recursive:true});
  fs.writeFileSync(path.join(repo,'assets/github-stats.svg'),images[0]);
  fs.writeFileSync(path.join(repo,'assets/github-stats-mobile.svg'),images[1]);
  console.log(`Updated ${username} stats from GitHub: ${isoDay(now)}.`);
}
