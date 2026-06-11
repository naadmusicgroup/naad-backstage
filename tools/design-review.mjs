import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3002';
const SCREENSHOT_DIR = './.codex-screenshots';

const pages = [
  { path: '/', name: 'home-redirect' },
  { path: '/login', name: 'login' },
];

const themes = ['light', 'dark'];

async function takeScreenshot(page, theme, pageName) {
  const filename = `${SCREENSHOT_DIR}/${theme}-${pageName}.png`;
  await page.screenshot({
    path: filename,
    fullPage: false,
  });
  console.log(`✓ Screenshot saved: ${filename}`);
  return filename;
}

async function getComputedStyles(page, selector) {
  return await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return null;
    const styles = window.getComputedStyle(element);
    return {
      display: styles.display,
      width: styles.width,
      height: styles.height,
      margin: styles.margin,
      padding: styles.padding,
      backgroundColor: styles.backgroundColor,
      color: styles.color,
      fontSize: styles.fontSize,
      fontFamily: styles.fontFamily,
      borderRadius: styles.borderRadius,
      border: styles.border,
      boxShadow: styles.boxShadow,
    };
  }, selector);
}

async function getSpacingIssues(page) {
  return await page.evaluate(() => {
    const issues = [];
    const allElements = document.querySelectorAll('*');

    allElements.forEach((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      // Check for inconsistent padding/margin
      const computedPadding = {
        top: parseFloat(style.paddingTop),
        right: parseFloat(style.paddingRight),
        bottom: parseFloat(style.paddingBottom),
        left: parseFloat(style.paddingLeft),
      };

      // Check for elements that are too close together (overlapping)
      if (rect.height > 20) { // Only check meaningful elements
        const nextSiblings = Array.from(allElements).filter(e => {
          const r = e.getBoundingClientRect();
          return r.top > rect.top && r.top < rect.bottom + 5;
        });

        if (nextSiblings.length > 0) {
          const nextRect = nextSiblings[0].getBoundingClientRect();
          const gap = nextRect.top - rect.bottom;
          if (gap < 0) {
            issues.push({
              element: el.tagName + (el.className ? `.${el.className.split(' ').join('.')}` : ''),
              issue: 'overlapping',
              gap: gap,
            });
          }
        }
      }

      // Check for tiny gaps (potential spacing inconsistency)
      const computedMargin = {
        top: parseFloat(style.marginTop),
        bottom: parseFloat(style.marginBottom),
      };
      if (computedMargin.top > 0 && computedMargin.top < 4) {
        issues.push({
          element: el.tagName,
          issue: 'tiny-top-margin',
          value: computedMargin.top,
        });
      }
    });

    return issues;
  });
}

async function scanForDesignIssues(page) {
  return await page.evaluate(() => {
    const issues = [];

    // Check for contrast issues
    const allText = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, a, button, label');
    allText.forEach(el => {
      const style = window.getComputedStyle(el);
      const bg = style.backgroundColor;
      const color = style.color;

      if (bg && color && bg !== 'rgba(0, 0, 0, 0)' && color !== 'rgba(0, 0, 0, 0)') {
        // Simple check for very low contrast (both very light or both very dark)
        const bgLum = getLuminance(bg);
        const textLum = getLuminance(color);
        const ratio = (Math.max(bgLum, textLum) + 0.05) / (Math.min(bgLum, textLum) + 0.05);

        if (ratio < 3) {
          issues.push({
            type: 'contrast',
            element: el.tagName,
            ratio: ratio.toFixed(2),
            bg,
            color,
          });
        }
      }
    });

    // Check for alignment issues
    const containers = document.querySelectorAll('[class*="flex"], [class*="grid"], [class*="container"]');
    containers.forEach(container => {
      const style = window.getComputedStyle(container);
      if (style.display === 'flex') {
        const items = Array.from(container.children);
        if (items.length > 1) {
          const firstRect = items[0].getBoundingClientRect();
          items.forEach((item, i) => {
            if (i > 0) {
              const rect = item.getBoundingClientRect();
              if (Math.abs(rect.left - firstRect.left) < 2 && Math.abs(rect.top - firstRect.top) > 5) {
                // Horizontal items at different vertical positions
              }
            }
          });
        }
      }
    });

    // Check for horizontal overflow
    const body = document.body;
    const bodyStyle = window.getComputedStyle(body);
    if (body.scrollWidth > body.clientWidth) {
      issues.push({
        type: 'horizontal-overflow',
        scrollWidth: body.scrollWidth,
        clientWidth: body.clientWidth,
      });
    }

    return issues;
  });
}

function getLuminance(color) {
  const rgb = color.match(/\d+/g);
  if (!rgb || rgb.length < 3) return 0;
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
  });

  console.log('=== COMPREHENSIVE DESIGN REVIEW ===\n');

  for (const theme of themes) {
    console.log(`\n--- Theme: ${theme.toUpperCase()} ---\n`);

    const page = await context.newPage();

    // Set theme via cookie or localStorage
    await page.goto(`${BASE_URL}/login`);
    await page.evaluate((t) => {
      localStorage.setItem('naad-theme', t);
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(t);
    }, theme);

    for (const p of pages) {
      console.log(`\n📄 Page: ${p.name} (${theme})`);

      try {
        await page.goto(`${BASE_URL}${p.path}`, { waitUntil: 'networkidle', timeout: 15000 });

        // Take screenshot
        const screenshotPath = await takeScreenshot(page, theme, p.name);

        // Get key computed styles
        const bodyStyles = await getComputedStyles(page, 'body');
        console.log(`  Body styles:`, JSON.stringify(bodyStyles, null, 2));

        // Check for spacing issues
        const spacingIssues = await getSpacingIssues(page);
        if (spacingIssues.length > 0) {
          console.log(`  ⚠️ Spacing issues found:`, spacingIssues.slice(0, 5));
        }

        // Scan for design issues
        const designIssues = await scanForDesignIssues(page);
        if (designIssues.length > 0) {
          console.log(`  ⚠️ Design issues:`, designIssues.slice(0, 5));
        }

        // Check for horizontal overflow
        const hasOverflow = await page.evaluate(() => {
          return document.body.scrollWidth > document.body.clientWidth;
        });
        if (hasOverflow) {
          console.log(`  ⚠️ Horizontal overflow detected`);
        }

      } catch (err) {
        console.log(`  ❌ Error loading ${p.path}: ${err.message}`);
      }
    }

    await page.close();
  }

  await browser.close();
  console.log('\n=== REVIEW COMPLETE ===');
}

main().catch(console.error);
