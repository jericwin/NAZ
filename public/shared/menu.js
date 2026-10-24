// Canonical NAZ Coffee menu. Shared by the browser (served at /shared/menu.js) and the server,
// which re-prices every order from this file instead of trusting client-submitted prices.
//
// Ported from the original order.html, with its runtime patches (MENU_PRICE_UPDATES,
// MENU_IMAGE_OVERRIDES, the Cheesecakes splice and the Syrup add-on) folded in.
// `entry` is the Google Form field for the item, or a `menu.*` key for items the form has no
// field for. Keep it stable: the order board and the Google Form depend on it.
// `options.choices` is the list a customer picks one value from per cart line.

export const MENU = [
  {
    id: "classics", name: "Classics",
    items: [
      {id: "long-black",name: "Long Black",price: 120,entry: "entry.749732879",image: "/assets/img/menu/long-black.webp",options: {type: "Temperature",choices: ["Hot","Iced"]}},
      {id: "cappuccino",name: "Cappuccino",price: 130,entry: "entry.1286008532",image: "/assets/img/menu/cappuccino.webp",options: {type: "Temperature",choices: ["Hot","Iced"]}},
      {id: "flat-white",name: "Flat White",price: 130,entry: "entry.555019143",image: "/assets/img/menu/flat-white.webp",options: {type: "Temperature",choices: ["Hot"]}},
      {id: "cafe-latte",name: "Cafe Latte",price: 130,entry: "entry.999891429",image: "/assets/img/menu/cafe-latte.webp",options: {type: "Temperature",choices: ["Hot","Iced"]}},
      {id: "cafe-mocha",name: "Cafe Mocha",price: 170,entry: "entry.1712522761",image: "/assets/img/menu/cafe-mocha.webp",options: {type: "Temperature",choices: ["Hot","Iced"]}}
    ]
  },
  {
    id: "staples", name: "Staples",
    items: [
      {id: "spanish-latte",name: "Spanish Latte",price: 170,entry: "entry.720599530",image: "/assets/img/menu/spanish-latte.webp",options: {type: "Temperature",choices: ["Hot","Iced"]}},
      {id: "sea-salt-latte",name: "Sea Salt Latte",price: 190,entry: "entry.1853865553",image: "/assets/img/menu/sea-salt-latte.webp",options: {type: "Temperature",choices: ["Hot","Iced"]}},
      {id: "caramel-cloud",name: "Caramel Cloud",price: 190,entry: "entry.2003537582",image: "/assets/img/menu/caramel-cloud.webp",options: {type: "Temperature",choices: ["Hot","Iced"]}},
      {id: "white-chocolate-mocha",name: "White Chocolate Mocha",price: 190,entry: "entry.184505544",image: "/assets/img/menu/white-chocolate-mocha.webp",options: {type: "Temperature",choices: ["Hot","Iced"]}},
      {id: "kori-kohi",name: "Kori-Kohi",price: 180,entry: "entry.190295533",image: "/assets/img/menu/kori-kohi.webp",options: {type: "Temperature",choices: ["Iced"]}}
    ]
  },
  {
    id: "cold-brew", name: "Cold Brew",
    items: [
      {id: "black",name: "Black",price: 130,entry: "entry.941213760",image: "/assets/img/menu/black.webp"},
      {id: "mont-blanc",name: "Mont Blanc",price: 160,entry: "entry.1389726794",image: "/assets/img/menu/mont-blanc.webp"}
    ]
  },
  {
    id: "matcha-bar", name: "Matcha Bar",
    items: [
      {id: "matcha-latte",name: "Matcha Latte",price: 180,entry: "entry.347643200",image: "/assets/img/menu/matcha-latte.webp",options: {type: "Temperature",choices: ["Hot","Iced"]}},
      {id: "matcha-lemonade",name: "Matcha Lemonade",price: 180,entry: "entry.2090161469",image: "/assets/img/menu/matcha-lemonade.webp"},
      {id: "dirty-matcha-latte",name: "Dirty Matcha Latte",price: 190,entry: "entry.1694184918",image: "/assets/img/menu/dirty-matcha-latte.webp",options: {type: "Temperature",choices: ["Hot","Iced"]}},
      {id: "sea-salt-matcha-latte",name: "Sea Salt Matcha Latte",price: 190,entry: "entry.2007538294",image: "/assets/img/menu/sea-salt-matcha-latte.webp",options: {type: "Temperature",choices: ["Hot","Iced"]}},
      {id: "matchagato",name: "Matchagato",price: 170,entry: "entry.2048529819",image: "/assets/img/menu/matchagato.webp"}
    ]
  },
  {
    id: "non-coffee", name: "Non-Coffee",
    items: [
      {id: "toasted-vanilla-milk",name: "Toasted Vanilla Milk",price: 160,entry: "entry.1584964599",image: "/assets/img/menu/toasted-vanilla-milk.webp",options: {type: "Temperature",choices: ["Hot","Iced"]}},
      {id: "classic-chocolate",name: "Classic Chocolate",price: 160,entry: "entry.1093210275",image: "/assets/img/menu/classic-chocolate.webp",options: {type: "Temperature",choices: ["Hot","Iced"]}}
    ]
  },
  {
    id: "affogato", name: "Affogato",
    items: [
      {id: "classic-affogato",name: "Classic Affogato",price: 140,entry: "entry.844035731",image: "/assets/img/menu/classic-affogato.webp"},
      {id: "biscoff-affogato",name: "Biscoff Affogato",price: 210,entry: "entry.2046550808",image: "/assets/img/menu/biscoff-affogato.webp"},
      {id: "chocolate-chip-affogato",name: "Chocolate Chip Affogato",price: 150,entry: "entry.1527179213",image: "/assets/img/menu/chocolate-chip-affogato.webp"}
    ]
  },
  {
    id: "ice-blended", name: "Ice Blended",
    items: [
      {id: "dark-choco-chip",name: "Dark Choco Chip",price: 170,entry: "entry.1196072113",image: "/assets/img/menu/dark-choco-chip.webp"},
      {id: "coffee-jelly",name: "Coffee Jelly",price: 190,entry: "entry.459812939",image: "/assets/img/menu/coffee-jelly.webp"},
      {id: "mango-biscoff",name: "Mango Biscoff",price: 210,entry: "entry.486750556",image: "/assets/img/menu/mango-biscoff.webp"}
    ]
  },
  {
    id: "refreshers", name: "Refreshers",
    items: [
      {id: "honey-lemon-hibiscus-tea",name: "Honey Lemon Hibiscus Tea",price: 170,entry: "entry.882967198",image: "/assets/img/menu/honey-lemon-hibiscus-tea.webp"},
      {id: "raspberry-lemon-tea",name: "Raspberry Lemon Tea",price: 190,entry: "entry.283872278",image: "/assets/img/menu/raspberry-lemon-tea.webp"},
      {id: "strawberry-sunrise",name: "Strawberry Sunrise",price: 190,entry: "entry.1570186981",image: "/assets/img/menu/strawberry-sunrise.webp"}
    ]
  },
  {
    id: "signature-creations", name: "Signature Creations",
    items: [
      {id: "minanok-latte",name: "Minanok Latte",price: 210,entry: "entry.1742638928",image: "/assets/img/menu/minanok-latte.webp"},
      {id: "sweet-monochrome",name: "Sweet Monochrome",price: 210,entry: "entry.1686935479",image: "/assets/img/menu/sweet-monochrome.webp"},
      {id: "chapter-31",name: "Chapter 31",price: 210,entry: "entry.87188811",image: "/assets/img/menu/chapter-31.webp"},
      {id: "naz-signature",name: "Naz Signature",price: 230,entry: "entry.1672800301",image: "/assets/img/menu/naz-signature.webp"}
    ]
  },
  {
    id: "dose", name: "DOSE",
    items: [
      {id: "brown-sugar-latte",name: "Brown Sugar Latte",price: 120,entry: "entry.694267209",image: "/assets/img/menu/brown-sugar-latte.webp",options: {type: "Size",choices: ["12oz","16oz"]}},
      {id: "coconut-latte",name: "Coconut Latte",price: 120,entry: "entry.972897942",image: "/assets/img/menu/coconut-latte.webp",options: {type: "Size",choices: ["12oz","16oz"]}},
      {id: "daybreak",name: "Daybreak",price: 120,entry: "entry.1332171556",image: "/assets/img/menu/daybreak.webp",options: {type: "Size",choices: ["12oz","16oz"]}},
      {id: "lychee-sparkler",name: "Lychee Sparkler",price: 120,entry: "entry.610072921",image: "/assets/img/menu/lychee-sparkler.webp",options: {type: "Size",choices: ["12oz","16oz"]}},
      {id: "strawberry-milk",name: "Strawberry Milk",price: 120,entry: "entry.174358586",image: "/assets/img/menu/strawberry-milk.webp",options: {type: "Size",choices: ["12oz","16oz"]}},
      {id: "purple-cloud",name: "Purple Cloud",price: 120,entry: "entry.1460873512",image: "/assets/img/menu/purple-cloud.webp",options: {type: "Size",choices: ["12oz","16oz"]}}
    ]
  },
  {
    id: "starters", name: "Starters",
    items: [
      {id: "chicken-bites",name: "Chicken Bites",price: 270,entry: "entry.860547945",image: "/assets/img/menu/chicken-bites.webp",options: {type: "Flavor",choices: ["Garlic Parmesan","Gochujang","Hot Honey Garlic"]}},
      {id: "naz-nachos",name: "Naz Nachos",price: 230,entry: "entry.483945431",image: "/assets/img/menu/naz-nachos.webp"},
      {id: "cheesy-beef-fries",name: "Cheesy Beef Fries",price: 180,entry: "entry.553853832",image: "/assets/img/menu/cheesy-beef-fries.webp"},
      {id: "quesadilla",name: "Quesadilla",price: 210,entry: "entry.326900185",image: "/assets/img/menu/quesadilla.webp"}
    ]
  },
  {
    id: "waffles", name: "Waffles",
    items: [
      {id: "maple-waffle",name: "Maple Waffle",price: 120,entry: "entry.529308054",image: "/assets/img/menu/maple-waffle.webp"},
      {id: "chocolate-waffle",name: "Chocolate Waffle",price: 120,entry: "entry.1664421040",image: "/assets/img/menu/chocolate-waffle.webp"},
      {id: "vanilla-ice-cream-waffle",name: "Vanilla Ice Cream Waffle",price: 150,entry: "entry.1551751035",image: "/assets/img/menu/vanilla-ice-cream-waffle.webp"},
      {id: "waffle-and-chicken",name: "Waffle and Chicken",price: 230,entry: "entry.751386370",image: "/assets/img/menu/waffle-and-chicken.webp"}
    ]
  },
  {
    id: "signature-sandwiches", name: "Signature Sandwiches",
    items: [
      {id: "hamburguesa-de-naz",name: "Hamburguesa de Naz",price: 270,entry: "entry.1457767167",image: "/assets/img/menu/hamburguesa-de-naz.webp"},
      {id: "monte-cristo",name: "Monte Cristo",price: 280,entry: "entry.774513660",image: "/assets/img/menu/monte-cristo.webp"}
    ]
  },
  {
    id: "signature-pasta", name: "Signature Pasta",
    items: [
      {id: "bagoong-aglio-olio",name: "Bagoong Aglio Olio",price: 210,entry: "entry.1472395665",image: "/assets/img/menu/bagoong-aglio-olio.webp"},
      {id: "cajun-chicken-alfredo",name: "Cajun Chicken Alfredo",price: 230,entry: "entry.1271838947",image: "/assets/img/menu/cajun-chicken-alfredo.webp"},
      {id: "naz-classic-lasagna",name: "Naz Classic Lasagna",price: 210,entry: "entry.1718137212",image: "/assets/img/menu/naz-classic-lasagna.webp"},
      {id: "breakfast-carbonara",name: "Breakfast Carbonara",price: 230,entry: "entry.1271036453",image: "/assets/img/menu/breakfast-carbonara.webp"}
    ]
  },
  {
    id: "rice-meals", name: "Rice Meals",
    items: [
      {id: "chicken-parmigiana",name: "Chicken Parmigiana",price: 250,entry: "entry.1350634848",image: "/assets/img/menu/chicken-parmigiana.webp"},
      {id: "garlic-pepper-beef",name: "Garlic Pepper Beef",price: 230,entry: "entry.1082326571",image: "/assets/img/menu/garlic-pepper-beef.webp"},
      {id: "gravy-burger-plate",name: "Gravy Burger Plate",price: 210,entry: "entry.653780376",image: "/assets/img/menu/gravy-burger-plate.webp"},
      {id: "calumpit-longganisa",name: "Calumpit Longganisa",price: 210,entry: "entry.1121433232",image: "/assets/img/menu/calumpit-longganisa.webp"},
      {id: "gochugogi-bowl",name: "Gochugogi Bowl",price: 210,entry: "entry.1894452233",image: "/assets/img/menu/gochugogi-bowl.webp"}
    ]
  },
  {
    id: "cheesecakes-pastries", name: "Cheesecakes & Pastries",
    items: [
      {id: "burnt-basque-cheesecake-classic",name: "Burnt Basque Cheesecake (Classic)",price: 160,entry: "menu.basque-classic",image: "/assets/img/menu/burnt-basque-cheesecake-classic.webp"},
      {id: "burnt-basque-cheesecake-matcha",name: "Burnt Basque Cheesecake (Matcha)",price: 160,entry: "menu.basque-matcha",image: "/assets/img/menu/burnt-basque-cheesecake-matcha.webp"},
      {id: "red-velvet",name: "Red Velvet",price: 160,entry: "menu.red-velvet",image: "/assets/img/menu/red-velvet.webp"}
    ]
  },
  {
    id: "additionals", name: "Additionals",
    items: [
      {id: "vanilla-ice-cream",name: "Vanilla Ice Cream",price: 50,entry: "entry.512008497",image: "/assets/img/menu/vanilla-ice-cream.webp"},
      {id: "whipped-cream",name: "Whipped Cream",price: 25,entry: "entry.789889487",image: "/assets/img/menu/whipped-cream.webp"},
      {id: "sub-oat",name: "Sub Oat",price: 50,entry: "entry.692188939",image: "/assets/img/menu/sub-oat.webp"},
      {id: "espresso-shot",name: "Espresso Shot",price: 50,entry: "entry.1218623740",image: "/assets/img/menu/espresso-shot.webp"},
      {id: "syrup",name: "Syrup",price: 30,entry: "menu.syrup",image: "/assets/img/menu/syrup.webp"}
    ]
  }
];

// Item-level descriptions shown on the landing page. Only facts taken from the existing menu
// and ordering rules belong here; do not add tasting notes or sourcing claims that are unverified.
export const CATEGORY_NOTES = {
  "dose": "Regular ₱120 each · Any 2 for ₱180 · Upsize (+₱30) per drink",
  "cold-brew": "Served in a 12oz cup"
};

export const RULES = Object.freeze({
  maxQtyPerLine: 5,
  maxLines: 40,
  doseCategory: "dose",
  doseUpsizeChoice: "16oz",
  doseUpsizePrice: 30,
  dosePairDiscount: 60,          // Any 2 DOSE drinks for ₱180 (2 × ₱120 − ₱60)
  rewardDiscount: 100,           // 100 points = ₱100 off (points earn at ₱20 = 1, tracked by the rewards backend)
  firstOrderMinimum: 300         // free Spanish Latte: after discounts and points redemption, excluding delivery
});

// `label` is the exact value the order board and Google Form have always received.
export const DELIVERY_AREAS = [
  { id: "pakil-pangil", label: "Pakil / Pangil — ₱20", fee: 20 },
  { id: "paete-siniloan", label: "Paete / Siniloan — ₱30", fee: 30 },
  { id: "famy-mabitac-kalayaan", label: "Famy / Mabitac / Kalayaan — ₱50", fee: 50 }
];

export const PAYMENT_METHODS = ["Cash", "GCash"];
export const ORDER_TYPES = ["Delivery", "Pick up", "Dine in"];
export const ORDER_TIMES = ["ASAP", "Later"];
