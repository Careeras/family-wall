/* Familiens menu - the fixed 15 family meals (verbatim names). No pork, ever.
   quick:true  = a [hurtig] meal for training nights.
   Links are allrecipes search links; img is a representative photo (TheMealDB CDN). */
const _IMG = "https://www.themealdb.com/images/media/meals/";
window.FAMILY_MENU = [
  { n: 1,  name: "Protein + Rice + Greens",            quick: true,  buy: "Protein, rice, greens, salad veg",                         link: "https://www.allrecipes.com/search?q=chicken%20rice%20bowl",                 img: _IMG + "5r5rvx1763287943.jpg" },
  { n: 2,  name: "Protein + Potatoes + Vegetables",    quick: false, buy: "Protein, potatoes, mixed veg, mushrooms",                  link: "https://www.allrecipes.com/search?q=chicken%20potatoes%20vegetables",        img: _IMG + "nlxald1764112200.jpg" },
  { n: 3,  name: "Shrimp Plate",                       quick: true,  buy: "Shrimp, potatoes or rice, asparagus or spinach, lemon",    link: "https://www.allrecipes.com/search?q=garlic%20shrimp",                        img: _IMG + "1525873040.jpg" },
  { n: 4,  name: "White Fish Plate",                   quick: true,  buy: "White fish, potatoes or rice, green veg, lemon",           link: "https://www.allrecipes.com/search?q=baked%20white%20fish",                   img: _IMG + "ysxwuq1487323065.jpg" },
  { n: 5,  name: "Shrimp Stir Fry",                    quick: true,  buy: "Shrimp, rice, broccoli, peppers, mushrooms, soy",          link: "https://www.allrecipes.com/search?q=shrimp%20stir%20fry",                    img: _IMG + "1529445434.jpg" },
  { n: 6,  name: "Chicken or Beef Stir Fry",           quick: true,  buy: "Chicken or beef, rice, mixed veg, soy or teriyaki",        link: "https://www.allrecipes.com/search?q=chicken%20stir%20fry",                   img: _IMG + "kyuxew1763479470.jpg" },
  { n: 7,  name: "Shawarma Wraps",                     quick: true,  buy: "Chicken or beef, whole wheat wraps, salad veg, yogurt",    link: "https://www.allrecipes.com/search?q=chicken%20shawarma",                     img: _IMG + "kcv6hj1598733479.jpg" },
  { n: 8,  name: "Fajitas",                            quick: true,  buy: "Chicken or beef, tortillas, peppers, onions, avocado",     link: "https://www.allrecipes.com/search?q=chicken%20fajitas",                      img: _IMG + "tvtxpq1511464705.jpg" },
  { n: 9,  name: "Burger Plate",                       quick: false, buy: "Beef or chicken, buns, salad veg, potatoes",               link: "https://www.allrecipes.com/search?q=beef%20burger",                          img: _IMG + "lgmnff1763789847.jpg" },
  { n: 10, name: "Pasta with Protein",                 quick: true,  buy: "Chicken or beef, whole grain pasta, tomato sauce, spinach",link: "https://www.allrecipes.com/search?q=chicken%20pasta",                        img: _IMG + "syqypv1486981727.jpg" },
  { n: 11, name: "Meatballs Plate",                    quick: false, buy: "Lean beef mince, potatoes or rice, veg or greens",         link: "https://www.allrecipes.com/search?q=beef%20meatballs",                       img: _IMG + "72fgzj1764109947.jpg" },
  { n: 12, name: "Warm Protein Bowl",                  quick: false, buy: "Chicken or beef, rice or potatoes, roasted veg, spinach",  link: "https://www.allrecipes.com/search?q=protein%20bowl",                         img: _IMG + "k29viq1585565980.jpg" },
  { n: 13, name: "Loaded Pita",                        quick: true,  buy: "Chicken or beef strips, pita, salad veg, yogurt",          link: "https://www.allrecipes.com/search?q=chicken%20pita",                         img: _IMG + "ae6clc1760524712.jpg" },
  { n: 14, name: "Egg, Falafel, Fool & Veggie Plate",  quick: true,  buy: "Eggs, falafel, fava beans, veg or salad",                  link: "https://www.allrecipes.com/search?q=falafel",                                img: _IMG + "u5e9qq1763795441.jpg" },
  { n: 15, name: "Grilled Protein + Roasted Veg",      quick: false, buy: "Chicken, beef or fish, roasting veg, mushrooms, spinach",  link: "https://www.allrecipes.com/search?q=grilled%20chicken%20roasted%20vegetables",img: _IMG + "rjhf741585564676.jpg" }
];
