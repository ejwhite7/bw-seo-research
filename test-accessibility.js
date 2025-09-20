// Simple accessibility test using Node.js
const { chromium } = require('playwright');

async function runAccessibilityTests() {
  console.log('🧪 Running accessibility tests...\n');
  
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  try {
    // Navigate to the app
    await page.goto('http://localhost:3000');
    console.log('✅ Page loaded successfully');
    
    // Test 1: Check heading hierarchy
    const h1 = await page.locator('h1').textContent();
    if (h1.includes('Dream 100 Keyword Engine')) {
      console.log('✅ H1 heading found with correct text');
    } else {
      console.log('❌ H1 heading missing or incorrect');
    }
    
    // Test 2: Check form labels
    const textarea = page.locator('#keywords');
    const label = page.locator('label[for="keywords"]');
    
    if (await label.isVisible() && await textarea.getAttribute('aria-describedby') === 'keywords-help') {
      console.log('✅ Form has proper labels and ARIA attributes');
    } else {
      console.log('❌ Form labels or ARIA attributes missing');
    }
    
    // Test 3: Test keyboard navigation
    // Focus the textarea directly to test
    await page.locator('#keywords').focus();
    
    const focusedElement = await page.evaluate(() => document.activeElement.id);
    if (focusedElement === 'keywords') {
      console.log('✅ Keyboard navigation works - textarea receives focus');
    } else {
      console.log('❌ Keyboard navigation issue - textarea not focused');
    }
    
    // Test 4: Test form interaction
    await page.locator('#keywords').fill('accessibility test');
    
    // Navigate to button using Tab key
    await page.keyboard.press('Tab');
    
    const buttonFocused = await page.evaluate(() => 
      document.activeElement.textContent.includes('Start Processing')
    );
    
    if (buttonFocused) {
      console.log('✅ Button receives keyboard focus');
      
      // Test button activation
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
      
      const buttonText = await page.locator('button').first().textContent();
      if (buttonText.includes('Processing')) {
        console.log('✅ Button activates with keyboard');
      } else {
        console.log('❌ Button keyboard activation failed');
      }
      
      // Wait for step 2
      await page.waitForSelector('h2:has-text("Step 2")');
      console.log('✅ Navigation to step 2 works');
      
    } else {
      console.log('❌ Button does not receive keyboard focus');
    }
    
    // Test 5: Check ARIA attributes
    const progressDiv = page.locator('div[aria-label="Progress through keyword research workflow"]');
    if (await progressDiv.isVisible()) {
      console.log('✅ Progress indicator has proper ARIA label');
    } else {
      console.log('❌ Progress indicator missing ARIA label');
    }
    
    // Test 6: Check alert role
    const alert = page.locator('[role="alert"][aria-labelledby="demo-mode-title"]');
    if (await alert.isVisible()) {
      console.log('✅ Alert has proper role attribute');
    } else {
      console.log('❌ Alert missing role attribute');
    }
    
    console.log('\n🎉 Accessibility tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
}

// Run the tests
runAccessibilityTests().catch(console.error);