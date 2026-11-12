/* Familiens menu - the fixed 15 family meals (verbatim names). No pork, ever.
   quick:true  = a [hurtig] meal for training nights.
   Links are allrecipes search links (allrecipes blocks direct scraping; swap in a
   specific video URL any time by editing `link`). */
window.FAMILY_MENU = [
  { n: 1,  name: "Protein + Rice + Greens",            quick: true,  buy: "Protein, rice, greens, salad veg",                         link: "https://www.allrecipes.com/search?q=chicken%20rice%20bowl" },
  { n: 2,  name: "Protein + Potatoes + Vegetables",    quick: false, buy: "Protein, potatoes, mixed veg, mushrooms",                  link: "https://www.allrecipes.com/search?q=chicken%20potatoes%20vegetables" },
  { n: 3,  name: "Shrimp Plate",                       quick: true,  buy: "Shrimp, potatoes or rice, asparagus or spinach, lemon",    link: "https://www.allrecipes.com/search?q=garlic%20shrimp" },
  { n: 4,  name: "White Fish Plate",                   quick: true,  buy: "White fish, potatoes or rice, green veg, lemon",           link: "https://www.allrecipes.com/search?q=baked%20white%20fish" },
  { n: 5,  name: "Shrimp Stir Fry",                    quick: true,  buy: "Shrimp, rice, broccoli, peppers, mushrooms, soy",          link: "https://www.allrecipes.com/search?q=shrimp%20stir%20fry" },
  { n: 6,  name: "Chicken or Beef Stir Fry",           quick: true,  buy: "Chicken or beef, rice, mixed veg, soy or teriyaki",        link: "https://www.allrecipes.com/search?q=chicken%20stir%20fry" },
  { n: 7,  name: "Shawarma Wraps",                     quick: true,  buy: "Chicken or beef, whole wheat wraps, salad veg, yogurt",    link: "https://www.allrecipes.com/search?q=chicken%20shawarma" },
  { n: 8,  name: "Fajitas",                            quick: true,  buy: "Chicken or beef, tortillas, peppers, onions, avocado",     link: "https://www.allrecipes.com/search?q=chicken%20fajitas" },
  { n: 9,  name: "Burger Plate",                       quick: false, buy: "Beef or chicken, buns, salad veg, potatoes",               link: "https://www.allrecipes.com/search?q=beef%20burger" },
  { n: 10, name: "Pasta with Protein",                 quick: true,  buy: "Chicken or beef, whole grain pasta, tomato sauce, spinach",link: "https://www.allrecipes.com/search?q=chicken%20pasta" },
  { n: 11, name: "Meatballs Plate",                    quick: false, buy: "Lean beef mince, potatoes or rice, veg or greens",         link: "https://www.allrecipes.com/search?q=beef%20meatballs" },
  { n: 12, name: "Warm Protein Bowl",                  quick: false, buy: "Chicken or beef, rice or potatoes, roasted veg, spinach",  link: "https://www.allrecipes.com/search?q=protein%20bowl" },
  { n: 13, name: "Loaded Pita",                        quick: true,  buy: "Chicken or beef strips, pita, salad veg, yogurt",          link: "https://www.allrecipes.com/search?q=chicken%20pita" },
  { n: 14, name: "Egg, Falafel, Fool & Veggie Plate",  quick: true,  buy: "Eggs, falafel, fava beans, veg or salad",                  link: "https://www.allrecipes.com/search?q=falafel" },
  { n: 15, name: "Grilled Protein + Roasted Veg",      quick: false, buy: "Chicken, beef or fish, roasting veg, mushrooms, spinach",  link: "https://www.allrecipes.com/search?q=grilled%20chicken%20roasted%20vegetables" }
];
