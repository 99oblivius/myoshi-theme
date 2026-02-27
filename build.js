const fs = require('fs');
const path = require('path');
const { transform, Features } = require('lightningcss');

const CSS_FILES = [
  'css/base.css',
  'css/profile.css',
];

const DIST_DIR = 'dist';
const OUTPUT_FILE = path.join(DIST_DIR, 'myoshi-profile.css');

const PROTECTED_SELECTORS = [
  'header.header',
  'footer.site-footer',
  'notification-dropdown',
  'profile-actions-dropdown',
];

const MAX_OUTPUT_SIZE = 50000;
const MAX_Z_INDEX = 10000;

function ensureDistDirectory() {
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }
}

function readCssFiles() {
  const contents = [];

  for (const file of CSS_FILES) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      contents.push(content);
    } catch (error) {
      console.error(`Error reading ${file}: ${error.message}`);
      process.exit(1);
    }
  }

  return contents;
}

function concatenateCss(contents) {
  return contents.join('\n');
}

function minifyCss(css) {
  try {
    const result = transform({
      filename: 'myoshi-profile.css',
      code: Buffer.from(css),
      minify: true,
      // Preserve vendor prefixes — platform only keeps -webkit-backdrop-filter
      exclude: Features.VendorPrefixes,
    });
    let output = result.code.toString();
    // lightningcss strips unprefixed backdrop-filter — add it back
    // after each -webkit-backdrop-filter declaration
    output = output.replace(
      /(-webkit-backdrop-filter:)([^;]+)(;?)/g,
      (match, prefix, value, semi) => `backdrop-filter:${value};${prefix}${value}${semi}`
    );
    return output;
  } catch (error) {
    console.error(`Error minifying CSS: ${error.message}`);
    process.exit(1);
  }
}

function validateOutput(css) {
  const issues = [];

  // Check for .profile-page.profile-custom-css prefix
  const profileCustomCssMatches = css.match(/\.profile-page\.profile-custom-css/g);
  if (profileCustomCssMatches) {
    issues.push({
      type: 'warning',
      message: `Found ${profileCustomCssMatches.length} instances of '.profile-page.profile-custom-css' prefix`,
    });
  }

  // Check for protected selectors
  for (const selector of PROTECTED_SELECTORS) {
    if (css.includes(selector)) {
      issues.push({
        type: 'error',
        message: `Found protected selector: ${selector}`,
      });
    }
  }

  // Check for position: fixed
  const fixedMatches = css.match(/position:\s*fixed/g);
  if (fixedMatches) {
    issues.push({
      type: 'error',
      message: `Found ${fixedMatches.length} instances of 'position: fixed'`,
    });
  }

  // Check for z-index values
  const zIndexMatches = css.match(/z-index:\s*(\d+)/g);
  if (zIndexMatches) {
    for (const match of zIndexMatches) {
      const value = parseInt(match.match(/\d+/)[0], 10);
      if (value > MAX_Z_INDEX) {
        issues.push({
          type: 'error',
          message: `z-index value ${value} exceeds maximum of ${MAX_Z_INDEX}`,
        });
      }
    }
  }

  return issues;
}

function reportResults(originalCss, minifiedCss, validationIssues) {
  const sourceFileCount = CSS_FILES.length;
  const originalSize = originalCss.length;
  const minifiedSize = minifiedCss.length;
  const compressionRatio = ((1 - minifiedSize / originalSize) * 100).toFixed(2);

  console.log('\n=== Build Report ===');
  console.log(`Source files: ${sourceFileCount}`);
  console.log(`Characters before minification: ${originalSize}`);
  console.log(`Characters after minification: ${minifiedSize}`);
  console.log(`Compression: ${compressionRatio}%`);

  if (minifiedSize > MAX_OUTPUT_SIZE) {
    console.warn(`\n⚠️  Warning: Output size (${minifiedSize} chars) exceeds ${MAX_OUTPUT_SIZE} chars`);
  }

  if (validationIssues.length > 0) {
    console.log('\n=== Validation Issues ===');
    for (const issue of validationIssues) {
      const icon = issue.type === 'error' ? '❌' : '⚠️';
      console.log(`${icon} ${issue.message}`);
    }
    if (validationIssues.some(i => i.type === 'error')) {
      process.exit(1);
    }
  } else {
    console.log('\n✓ All validation checks passed');
  }

  console.log(`\nOutput written to: ${OUTPUT_FILE}\n`);
}

function main() {
  ensureDistDirectory();
  const cssContents = readCssFiles();
  const concatenatedCss = concatenateCss(cssContents);
  const minifiedCss = minifyCss(concatenatedCss);
  const validationIssues = validateOutput(minifiedCss);

  fs.writeFileSync(OUTPUT_FILE, minifiedCss, 'utf8');

  reportResults(concatenatedCss, minifiedCss, validationIssues);
}

main();
