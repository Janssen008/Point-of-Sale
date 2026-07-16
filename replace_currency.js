const fs = require('fs');

function replaceCurrency(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace literal '$' before numbers (e.g. $0.00)
  content = content.replace(/\$(\d+\.\d+)/g, '₱$1');
  
  // Replace literal '$' before numbers without decimal (e.g. $10)
  content = content.replace(/\$(\d+)(?!\.)/g, '₱$1');
  
  // Replace '($)' with '(₱)'
  content = content.replace(/\(\$\)/g, '(₱)');
  
  // Replace '+$' with '+₱'
  content = content.replace(/\+\$/g, '+₱');
  
  // Replace `>$<` with `>₱<`
  content = content.replace(/>\$</g, '>₱<');
  
  // Replace `$${` with `₱${`
  content = content.replace(/\$\$\{/g, '₱${');
  
  // Replace `-$` with `-₱`
  content = content.replace(/-\$/g, '-₱');

  // Replace `Total: $`
  content = content.replace(/Total: \$/g, 'Total: ₱');
  
  fs.writeFileSync(filePath, content, 'utf8');
}

replaceCurrency('./index.html');
replaceCurrency('./app.js');
console.log('Currency replaced with PESO');
