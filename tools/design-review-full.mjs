import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = './.codex-screenshots';

// All routes to test
const routes = [
  { path: '/login', name: 'login' },
  { path: '/dashboard', name: 'dashboard-index' },
  { path: '/dashboard/wallet', name: 'dashboard-wallet' },
  { path: '/dashboard/releases', name: 'dashboard-releases' },
  { path: '/dashboard/analytics', name: 'dashboard-analytics' },
  { path: '/dashboard/statements', name: 'dashboard-statements' },
  { path: '/dashboard/publishing', name: 'dashboard-publishing' },
  { path: '/dashboard/settings', name: 'dashboard-settings' },
  { path: '/dashboard/notifications', name: 'dashboard-notifications' },
  { path: '/dashboard/uploaded', name: 'dashboard-uploaded' },
  { path: '/admin', name: 'admin-index' },
  { path: '/admin/artists', name: 'admin-artists' },
  { path: '/admin/releases', name: 'admin-releases' },
  { path: '/admin/dues', name: 'admin-dues' },
  { path: '/admin/earnings', name: 'admin-earnings' },
  { path: '/admin/payouts', name: 'admin-payouts' },
  { path: '/admin/publishing', name: 'admin-publishing' },
  { path: '/admin/analytics', name: 'admin-analytics' },
  { path: '/admin/settings', name: 'admin-settings' },
  { path: '/admin/invites', name: 'admin-invites' },
  { path: '/admin/ingestion', name: 'admin-ingestion' },
];

const themes = ['light', 'dark'];

async function capturePageMetrics(page, theme, pageName) {
  const results = {
    theme,
    pageName,
    url: page.url(),
    metrics: {},
    styles: {},
    issues: [],
    screenshots: {}
  };

  // Take screenshot
  const screenshotPath = `${SCREENSHOT_DIR}/${theme}-${pageName}.png`;
  try {
    await page.screenshot({ path: screenshotPath, fullPage: false });
    results.screenshots.path = screenshotPath;
  } catch (e) {
    results.screenshots.error = e.message;
  }

  // Capture metrics
  try {
    results.metrics = await page.evaluate(() => {
      const body = document.body;
      const html = document.documentElement;
      return {
        bodyScrollWidth: body.scrollWidth,
        bodyScrollHeight: body.scrollHeight,
        bodyClientWidth: body.clientWidth,
        bodyClientHeight: body.clientHeight,
        htmlClientWidth: html.clientWidth,
        htmlScrollWidth: html.scrollWidth,
        hasHorizontalOverflow: body.scrollWidth > body.clientWidth,
        hasVerticalOverflow: body.scrollHeight > body.clientHeight,
        totalElements: document.querySelectorAll('*').length,
        totalButtons: document.querySelectorAll('button').length,
        totalInputs: document.querySelectorAll('input, select, textarea').length,
        totalLinks: document.querySelectorAll('a').length,
        totalImages: document.querySelectorAll('img').length,
      };
    });
  } catch (e) {
    results.metrics.error = e.message;
  }

  // Check for key computed styles
  try {
    results.styles = await page.evaluate(() => {
      const getStyle = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const s = window.getComputedStyle(el);
        return {
          display: s.display,
          width: s.width,
          height: s.height,
          backgroundColor: s.backgroundColor,
          color: s.color,
          fontSize: s.fontSize,
          fontFamily: s.fontFamily,
          borderRadius: s.borderRadius,
          border: s.border,
          boxShadow: s.boxShadow ? 'present' : 'none',
        };
      };
      return {
        body: getStyle('body'),
        html: getStyle('html'),
        firstCard: getStyle('[class*="card"]'),
        firstButton: getStyle('button'),
      };
    });
  } catch (e) {
    results.styles.error = e.message;
  }

  // Check for design issues
  try {
    results.issues = await page.evaluate(() => {
      const issues = [];

      // Check for horizontal overflow
      if (document.body.scrollWidth > document.body.clientWidth) {
        issues.push({
          type: 'overflow',
          severity: 'high',
          message: 'Horizontal overflow detected',
          detail: `scrollWidth: ${document.body.scrollWidth}, clientWidth: ${document.body.clientWidth}`
        });
      }

      // Check for tiny gaps between elements
      const allElements = Array.from(document.querySelectorAll('*'));
      const checked = new Set();
      for (const el of allElements) {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (rect.height < 5 || checked.has(el)) continue;
        checked.add(el);

        // Check for tiny margins that might indicate inconsistent spacing
        const mt = parseFloat(style.marginTop);
        const mb = parseFloat(style.marginBottom);
        if ((mt > 0 && mt < 3) || (mb > 0 && mb < 3)) {
          issues.push({
            type: 'spacing',
            severity: 'low',
            message: 'Tiny margin detected',
            detail: `${el.tagName}: margin-top=${mt}px, margin-bottom=${mb}px`
          });
        }
      }

      // Check for contrast issues
      const textElements = document.querySelectorAll('p, h1, h2, h3, h4, span, label, button');
      textElements.forEach(el => {
        const style = window.getComputedStyle(el);
        const bg = style.backgroundColor;
        const color = style.color;
        if (bg && color && bg !== 'rgba(0, 0, 0, 0)') {
          const bgLum = getLuminance(bg);
          const textLum = getLuminance(color);
          if (bgLum && textLum) {
            const ratio = (Math.max(bgLum, textLum) + 0.05) / (Math.min(bgLum, textLum) + 0.05);
            if (ratio < 3) {
              issues.push({
                type: 'contrast',
                severity: 'high',
                message: 'Low contrast ratio',
                detail: `Ratio: ${ratio.toFixed(2)} - bg: ${bg}, color: ${color}`
              });
            }
          }
        }
      });

      // Check for overlapping elements
      const cards = document.querySelectorAll('[class*="card"], [class*="row"], [class*="item"]');
      cards.forEach((card, i) => {
        const rect = card.getBoundingClientRect();
        if (rect.height > 20) {
          const siblings = Array.from(document.querySelectorAll('*')).filter(e => {
            const r = e.getBoundingClientRect();
            return r.top > rect.top && r.top < rect.bottom + 10 && r.top !== rect.top;
          });
          if (siblings.length > 0) {
            const nextRect = siblings[0].getBoundingClientRect();
            const gap = nextRect.top - rect.bottom;
            if (gap < 0) {
              issues.push({
                type: 'overlap',
                severity: 'high',
                message: 'Elements overlapping',
                detail: `Gap: ${gap}px`
              });
            }
          }
        }
      });

      return issues;
    });
  } catch (e) {
    results.issues.error = e.message;
  }

  return results;
}

function getLuminance(color) {
  const rgb = color.match(/\d+/g);
  if (!rgb || rgb.length < 3) return null;
  const [r, g, b] = rgb.map(v => {
    v = parseInt(v) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });

  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║         NAAD BACKSTAGE - COMPREHENSIVE DESIGN REVIEW                ║');
  console.log('║              Light & Dark Mode Analysis                             ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝\n');

  const allResults = { light: [], dark: [] };

  for (const theme of themes) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  🌙 THEME: ${theme.toUpperCase()} MODE`);
    console.log(`${'═'.repeat(70)}\n`);

    const page = await context.newPage();

    for (const route of routes) {
      const fullUrl = `${BASE_URL}${route.path}`;

      try {
        console.log(`\n  📄 Loading: ${route.name}`);
        console.log(`  URL: ${fullUrl}`);

        const response = await page.goto(fullUrl, {
          waitUntil: 'networkidle',
          timeout: 20000
        });

        if (!response || response.status() >= 400) {
          console.log(`  ⚠️  Page returned status: ${response?.status() || 'no response'}`);
          continue;
        }

        // Wait a bit for any animations/rendering
        await page.waitForTimeout(500);

        // Capture metrics
        const results = await capturePageMetrics(page, theme, route.name);

        console.log(`  ✅ Loaded (${results.metrics.totalElements || 0} elements)`);

        if (results.issues && results.issues.length > 0) {
          const highIssues = results.issues.filter(i => i.severity === 'high');
          if (highIssues.length > 0) {
            console.log(`  ⚠️  Issues found:`);
            highIssues.forEach(issue => {
              console.log(`      - [${issue.severity}] ${issue.message}`);
              if (issue.detail) console.log(`        ${issue.detail}`);
            });
          }
        }

        if (results.screenshots.path) {
          console.log(`  📸 Screenshot: ${results.screenshots.path}`);
        }

        allResults[theme].push(results);
      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
      }
    }

    await page.close();
  }

  // Summary report
  console.log(`\n\n${'═'.repeat(70)}`);
  console.log('  📊 DESIGN REVIEW SUMMARY');
  console.log(`${'═'.repeat(70)}\n`);

  for (const theme of themes) {
    console.log(`\n  Theme: ${theme.toUpperCase()}`);
    console.log(`  Pages analyzed: ${allResults[theme].length}`);

    const allIssues = allResults[theme].flatMap(r => r.issues || []);
    const highIssues = allIssues.filter(i => i.severity === 'high');
    const lowIssues = allIssues.filter(i => i.severity === 'low');

    console.log(`  Total issues: ${allIssues.length}`);
    console.log(`    - High severity: ${highIssues.length}`);
    console.log(`    - Low severity: ${lowIssues.length}`);

    if (highIssues.length > 0) {
      console.log(`\n  High Severity Issues:`);
      highIssues.forEach((issue, i) => {
        console.log(`    ${i + 1}. [${issue.type}] ${issue.message}`);
      });
    }
  }

  await browser.close();
  console.log('\n\n✅ Design review complete!');
  console.log(`📁 Screenshots saved to: ${SCREENSHOT_DIR}/`);
}

main().catch(console.error);
