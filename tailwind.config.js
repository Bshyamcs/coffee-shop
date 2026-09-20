module.exports = {
  content: ['./public/index.html', './public/app.js', './public/admin.js'],
  theme: {
    extend: {
      colors: { offwhite: '#FDFCF9', charcoal: '#151515', darkcharcoal: '#1C1C1A', coffee: '#6B4935', surface: '#F1ECE4', subtle: '#757575', wagreen: '#25D366' },
      fontFamily: { serif: ['Cormorant Garamond', 'Georgia', 'serif'], sans: ['Inter', 'sans-serif'] },
      letterSpacing: { widest: '.2em', superwide: '.3em' },
    },
  },
};
