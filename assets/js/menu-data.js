/* ============================ MENU DATA ============================ */
const APPS = (crab, egg) => ([
  {n:"Baked Oysters", d:"Three Louisiana Gulf oysters baked with crab meat, topped with seasoned house stuffing", p:24, s:1, img:"oysters"},
  {n:"Fried Artichokes", d:"Crispy artichoke hearts served with warm bearnaise", p:14, v:1},
  {n:"Fried Okra", d:"Lightly fried okra with spicy dill sauce", p:14, v:1, hot:1},
  {n:"Seafood Arancini", d:"Shrimp and crab rolled with risotto, fried, served with alfredo and vodka tomato cream sauce", p:16, s:1},
  {n:"Sauteed Crab Fingers", d:"Louisiana crab fingers sauteed with garlic beurre blanc and topped with parmesan", p:24, s:1},
  {n:"Shrimp Cocktail", d:"Five Gulf shrimp served chilled", p:16, s:1,
   o:[{g:"Sauce", t:"one", c:[{l:"Cocktail sauce"},{l:"Remoulade"}]}]},
  {n:"Firecracker Shrimp", d:"Freshly fried shrimp tossed in spicy chili aioli", p:16, s:1, hot:1, img:"firecracker"},
  {n:"Crab Cakes", d:"Two jumbo lump crab cakes, pan seared and drizzled with remoulade", p:crab, s:1, img:"crabcakes"},
  {n:"Fried Eggplant", d:"Fried eggplant medallions set in meuniere sauce, topped with jumbo lump crab meat, garlic beurre blanc and hollandaise", p:egg, s:1},
  {n:"Meatballs", d:"Three hand-rolled meatballs with marinara and toasted garlic bread", p:16, img:"meatballs"},
  {n:"BBQ Shrimp", d:"Five Gulf shrimp sauteed in traditional New Orleans barbecue butter, toasted garlic bread", p:16, s:1}
]);
const SOUP = {n:"Soup of the Day", d:"Ask about today's pot", p:8, img:"soup",
  o:[{g:"Size", t:"one", c:[{l:"Cup"},{l:"Bowl", p:8}]}]};

const MENUS = {
  dinner:{label:"Dinner", hrs:"From 4:00 PM", courses:[
    {id:"d-app", name:"Appetizers", items:APPS(24,22)},
    {id:"d-soup", name:"Soup", items:[SOUP]},
    {id:"d-sal", name:"Salads", items:[
      {n:"Sensation Salad", d:"Our house salad — crisp romaine and iceberg tossed with sensation dressing, topped with parmesan", p:6, v:1},
      {n:"Caesar Salad", d:"Romaine tossed with house-made Caesar dressing, parmesan and garlic croutons", p:8, v:1,
       o:[{g:"Make it a meal", t:"many", c:[{l:"Add fried oysters", p:8},{l:"Add fried shrimp", p:6}]}]},
      {n:"Blue Cheese Wedge", d:"Wedge of iceberg with tomatoes, red onion, bacon and blue cheese dressing", p:12, img:"wedge"},
      {n:"Caprese Salad", d:"Sliced tomatoes with buffalo mozzarella, fresh basil, kosher salt, balsamic and olive oil", p:14, v:1},
      {n:"Seafood Salad", d:"Romaine and iceberg with creamy dill dressing", p:16, s:1,
       o:[{g:"Top it with", t:"many", req:1, c:[{l:"Jumbo lump crabmeat"},{l:"Cajun boiled shrimp"}]}]}
    ]},
    {id:"d-ent", name:"Entrees", items:[
      {n:"Redfish Picatta", d:"Grilled filet of redfish topped with sauteed jumbo lump crab meat, artichoke hearts, capers and garlic lemon butter cream sauce", p:42, s:1, img:"redfish"},
      {n:"Louisiane", d:"Pan-sauteed filet of fresh fish topped with jumbo lump crab meat and lemon butter", p:38, s:1},
      {n:"Lafitte", d:"Pan-sauteed filet of fresh fish with garlic beurre blanc and hollandaise, topped with grilled shrimp", p:32, s:1},
      {n:"Pontchartrain", d:"Pan-sauteed filet of fresh fish topped with fried softshell crab, honey-roasted almonds and pecans, hollandaise", p:40, s:1, img:"pontchartrain"},
      {n:"Tuna Bernadino", d:"Yellowfin tuna seared rare, jumbo lump crab meat, soy ginger glaze, pickled cucumber salad", p:40, s:1, img:"tuna"},
      {n:"Seafood Stuffed Bell Peppers", d:"Jumbo lump crabmeat and shrimp stuffed bell peppers, baked and finished with garlic beurre blanc", p:34, s:1, img:"peppers"},
      {n:"Fried Seafood Platter", d:"Served with fries", p:30, s:1,
       o:[{g:"Choose your seafood", t:"many", req:1, c:[{l:"Jumbo Gulf shrimp"},{l:"Oysters"},{l:"Catfish"}]}]},
      {n:"Shrimp Risotto", d:"Sauteed Gulf shrimp folded into creamy risotto with parmesan, fresh basil and Roma tomatoes, topped with panko-encrusted shrimp", p:26, s:1},
      {n:"Cajun Fettuccini Alfredo", d:"Fettuccini in Cajun-spiced alfredo with ground andouille sausage", p:28, hot:1,
       o:[{g:"Choose your protein", t:"one", c:[{l:"Shrimp"},{l:"Chicken"}]}]},
      {n:"Spaghetti & Meatballs", d:"Spaghetti tossed with house marinara, topped with our hand-rolled meatballs", p:28},
      {n:"Grits & Grillades", d:"Slow-braised beef tenderloin stew over fried gouda grit cakes", p:30},
      {n:"Chicken Florentine", d:"Two baked chicken breasts stuffed with andouille, mozzarella and spinach, cheesy mornay sauce", p:30},
      {n:"Tournedos", d:"Prime tenderloin medallions over garlic beurre blanc, topped with grilled shrimp and jumbo lump crab meat, finished with bearnaise", p:42, s:1},
      {n:"Filet", d:"8 oz cut of prime beef tenderloin", p:48, o:STEAK()},
      {n:"Ribeye", d:"16 oz prime ribeye", p:60, o:STEAK()}
    ]},
    {id:"d-side", name:"Sides", items:[
      {n:"Seasonal Vegetable", p:8, v:1},{n:"French Fries", p:5, v:1},
      {n:"Loaded Mashed Potatoes", p:5},{n:"Lyonnaise Potatoes", p:8, v:1},
      {n:"Sauteed Green Beans", p:7, v:1},{n:"Broccoli au Gratin", p:8, v:1},
      {n:"Creamed Spinach", p:6, v:1}
    ]},
    {id:"d-kids", name:"Kids", note:"For guests 12 and under.", items:[
      {n:"Fried Chicken Tenders", p:12, o:[KIDSIDE()]},
      {n:"Fried Popcorn Shrimp", p:12, s:1, o:[KIDSIDE()]},
      {n:"Spaghetti & Meatballs", d:"Tossed with our marinara, topped with two house-made meatballs", p:15},
      {n:"Chicken Alfredo", d:"Fettuccini tossed with our alfredo sauce and grilled chicken", p:15}
    ]},
    {id:"d-des", name:"Desserts", note:"All desserts $8.", items:[
      {n:"Blueberry Bread Pudding", d:"Traditional fluffy bread pudding with blueberries and vanilla cognac sauce", p:8, v:1, img:"breadpudding"},
      {n:"Chocolate Creme Brulee", d:"Dark chocolate cream custard, burnt sugar crust, powdered sugar, raspberries, whipped cream", p:8, v:1, img:"dessert"},
      {n:"Cheesecake", d:"Traditional New York style", p:8, v:1,
       o:[{g:"Topping", t:"one", c:[{l:"Strawberry"},{l:"Raspberry"},{l:"Blueberry"},{l:"Turtle"}]}]},
      {n:"Key Lime Pie", d:"Tart key lime filling in a graham cracker crust, whipped cream", p:8, v:1},
      {n:"Pecan Pie", d:"Traditional caramel custard pie made with pecans, vanilla ice cream", p:8, v:1}
    ]}
  ]},

  lunch:{label:"Lunch", hrs:"11 AM – 2 PM", courses:[
    {id:"l-app", name:"Appetizers", items:APPS(23,20)},
    {id:"l-soup", name:"Soup", items:[SOUP]},
    {id:"l-sal", name:"Salads", items:[
      {n:"Sensation Salad", d:"Crisp romaine and iceberg tossed with sensation dressing, topped with parmesan", p:8, v:1},
      {n:"Caesar Salad", d:"Romaine tossed with house-made Caesar dressing, parmesan and garlic croutons", p:12, v:1,
       o:[{g:"Make it a meal", t:"many", c:[{l:"Add fried oysters", p:8},{l:"Add fried shrimp", p:6}]}]},
      {n:"Blue Cheese Wedge", d:"Wedge of iceberg with tomatoes, red onion, bacon and blue cheese dressing", p:12, img:"wedge"},
      {n:"Seafood Salad", d:"Romaine and iceberg with creamy dill dressing", p:24, s:1,
       o:[{g:"Top it with", t:"many", req:1, c:[{l:"Jumbo lump crabmeat"},{l:"Cajun boiled shrimp"}]}]}
    ]},
    {id:"l-hand", name:"Handhelds", note:"Each comes with your choice of side.", items:[
      {n:"Hot Sausage Poboy", d:"Spicy sausage links on a toasted po-boy bun, fully dressed with lettuce, pickles and tomato", p:16, hot:1,
       o:[SIDE(), {g:"Dressed with", t:"one", c:[{l:"Mayonnaise"},{l:"Mustard"},{l:"Both"}]}]},
      {n:"Fried Oyster Poboy", d:"Fried Gulf oysters on a toasted po-boy bun, fully dressed", p:20, s:1, o:[SIDE(), SAUCE()]},
      {n:"Fried Catfish Poboy", d:"Fried Gulf catfish on a toasted po-boy bun, fully dressed", p:16, o:[SIDE(), SAUCE()], img:"poboy"},
      {n:"Fried Shrimp Poboy", d:"Fried Gulf shrimp on a toasted po-boy bun, fully dressed", p:18, s:1, o:[SIDE(), SAUCE()]},
      {n:"Chipotle Shrimp Tacos", d:"Grilled marinated Gulf shrimp over house slaw, chipotle aioli, two flour tortillas", p:16, s:1, hot:1,
       o:[{g:"Extra tacos", t:"many", c:[{l:"One more taco", p:6},{l:"Two more tacos", p:12}]}]},
      {n:"Crab Cake Sandwich", d:"Pan-seared crab cake on a toasted bun with lettuce, tomato and remoulade", p:25, s:1, o:[SIDE()]},
      {n:"Blackened Chicken Sandwich", d:"Blackened chicken breast on a toasted bun with mayonnaise, buffalo mozzarella, tomato and basil pesto", p:16, o:[SIDE()]},
      {n:"Meatball Sub", d:"House-made meatballs and marinara on a toasted po-boy bun with buffalo mozzarella", p:18, o:[SIDE()]},
      {n:"Prime Rib Sandwich", d:"Sliced prime rib on french bread with au jus and horseradish sauce", p:28, o:[SIDE()]}
    ]}
  ]},

  bar:{label:"Cocktails", hrs:"Tableside service", courses:[
    {id:"b-seas", name:"Seasonal cocktails", items:[
      {n:"Agave Palm Smash", d:"1800 Coconut Tequila, Del Maguey Mezcal, fresh lime, mint, simple", p:14},
      {n:"Yuzu Lemonade", d:"Grey Goose Vodka, Ferrand Yuzu Curacao, fresh lemon, simple", p:14}
    ]},
    {id:"b-mock", name:"Mocktails", items:[
      {n:"Blossom Spritz", d:"Strawberries, rose cordial, sour, lemon-lime soda", p:6, v:1},
      {n:"Spring Soda", d:"Hibiscus tea, pomegranate syrup, sour, lemon-lime soda", p:6, v:1}
    ]},
    {id:"b-sig", name:"Signature cocktails", items:[
      {n:"Smoky Grains", d:"Pinhook Bourbon, Angostura bitters, Luxardo syrup, orange peel, smoke", p:18},
      {n:"Orange Chocolate Old Fashioned", d:"Tempus Fugit creme de cacao, brown sugar simple, Angostura orange bitters", p:16,
       o:[{g:"Base spirit", t:"one", c:[{l:"Diplomatico Rum"},{l:"Pinhook Rye Whiskey"}]}]},
      {n:"Cold Brew Martini", d:"Tempus Fugit creme de cacao, cold brew concentrate, brown sugar simple", p:15,
       o:[{g:"Base spirit", t:"one", c:[{l:"Grey Goose Vodka"},{l:"La Gritona Reposado Tequila"}]}]},
      {n:"Sour Jewel", d:"Maker's Mark Bourbon, PAMA liqueur, fresh lemon, simple syrup", p:15},
      {n:"Garden Gimlet", d:"St. Germain elderflower liqueur, fresh lime, basil simple syrup", p:15,
       o:[{g:"Base spirit", t:"one", c:[{l:"Effen Cucumber Vodka"},{l:"Hendrick's Gin"}]}]},
      {n:"Rosa Maria", d:"Cathead Honeysuckle Vodka, rosemary syrup, lemon juice, sparkling wine", p:13, img:"drink"},
      {n:"Habanero Jalisco", d:"Habanero-infused Rancho Alegre Reposado, Cointreau blood orange, fresh lime, simple", p:15, hot:1},
      {n:"Berry Blush", d:"Absolut Raspberry Vodka, PAMA liqueur, fresh lime, cranberry", p:13, img:"berryblush"},
      {n:"Suncatcher Sangria", d:"Mommenpop blood orange vermouth, citrus-infused E&J brandy, sparkling wine", p:14,
       o:[{g:"Made with", t:"one", c:[{l:"Red wine"},{l:"White wine"}]}]}
    ]},
    {id:"b-cls", name:"Classics", note:"Priced by the spirit you choose — your server or bartender will walk you through it.", items:[
      {n:"Margarita", d:"Tequila, Cointreau or Grand Marnier, fresh lime, simple syrup", p:null},
      {n:"Moscow Mule", d:"Vodka, fresh lime, ginger beer", p:null},
      {n:"Lemon Drop", d:"Vodka, Cointreau, fresh lemon, simple syrup — blueberry, raspberry or strawberry", p:null},
      {n:"Cosmopolitan", d:"Vodka, Cointreau, fresh lime, cranberry", p:null},
      {n:"French 75", d:"Vodka, gin or cognac, Cointreau, fresh lemon, sparkling wine", p:null},
      {n:"Sidecar", d:"Cognac, Grand Marnier, fresh lemon", p:null},
      {n:"Sazerac", d:"Rye whiskey, Peychaud's and Angostura bitters, simple syrup, Herbsaint rinse", p:null},
      {n:"Manhattan", d:"Bourbon or whiskey, Trinchero Vermouth Rosso, Angostura bitters, Luxardo cherry", p:null}
    ]}
  ]},

  wine:{label:"Wine", hrs:"By the glass or bottle", wine:1, courses:[
    {id:"w-spark", name:"Sparkling", wine:1, items:[
      {n:"Maison de Madeleine", g:"Brut", v:"Vin de France", h:5, gl:9, b:30},
      {n:"Serenello Prosecco", g:"Glera", v:"Veneto, Italy", h:5, gl:11, b:36},
      {n:"Moet & Chandon", g:"Brut, split", v:"Champagne, France", gl:16, b:118},
      {n:"Lelievre Leucquois", g:"Brut Rose, Gamay", v:"France", h:9, gl:16, b:56},
      {n:"Schramsberg", g:"Blanc de Noir", v:"California", b:90},
      {n:"Veuve Cliquot 'Yellow Label'", g:"Brut", v:"Champagne, France", b:122}
    ]},
    {id:"w-white", name:"White", wine:1, items:[
      {n:"Famille Hugel Gentil", g:"Field blend", v:"Alsace, France", h:7, gl:13, b:39},
      {n:"Pfaffenberg Schloss Schonborn", g:"Riesling", v:"Rheingau, Germany", b:94},
      {n:"Tenuta delle Terre Nere 'Montalto'", g:"Carricante", v:"Mt. Etna, Sicily, Italy", b:90},
      {n:"Burgans", g:"Albarino", v:"Rias Baixas, Spain", h:8, gl:15, b:54},
      {n:"Familia Torres 'Celeste' Sur Lie", g:"Verdejo", v:"Rueda, Castile y Leon, Spain", h:8, gl:14, b:49},
      {n:"Jean de Villebois", g:"Sauvignon Blanc", v:"Touraine, Loire Valley, France", h:7, gl:12, b:42},
      {n:"Le Garenne", g:"Sauvignon Blanc", v:"Sancerre, Loire Valley, France", b:60},
      {n:"Cembra Classici", g:"Pinot Grigio", v:"Trentino-Alto Adige, Italy", h:6, gl:11, b:39},
      {n:"Domaine Perraud", g:"Chardonnay", v:"Macon Villages, Burgundy, France", h:9, gl:17, b:60},
      {n:"Illahe", g:"Viognier", v:"Willamette Valley, Oregon", h:8, gl:14, b:49},
      {n:"Clara Sala Sicilia Bianco", g:"Grillo", v:"Sicily, Italy", h:5, gl:11, b:38},
      {n:"Antinori 'Cervaro'", g:"Chardonnay, Grechetto", v:"Umbria, Italy", b:120},
      {n:"Gainey Estate Vineyards", g:"Chardonnay", v:"Santa Rita Hills, California", h:8, gl:14, b:49},
      {n:"Frank Family", g:"Chardonnay", v:"Carneros, California", b:62},
      {n:"Round Pond Kith & Kin", g:"Chardonnay", v:"Napa Valley, California", b:74}
    ]},
    {id:"w-rose", name:"Rose", wine:1, items:[
      {n:"Moises", g:"Pinot Noir", v:"Willamette Valley, Oregon", h:7, gl:13, b:46},
      {n:"Domaine Petroni", g:"Niellucciu, Sciaccarellu, Grenache", v:"Vin de Corse, Corsica", h:6, gl:11, b:39}
    ]},
    {id:"w-red", name:"Red", wine:1, items:[
      {n:"Outlier", g:"Pinot Noir", v:"Lake County, California", h:8, gl:14, b:49},
      {n:"Patient Cottat Le Grand Caillou", g:"Pinot Noir", v:"IGP Loire, France", h:6, gl:10, b:35},
      {n:"Goldeneye", g:"Pinot Noir", v:"Anderson Valley, California", b:98},
      {n:"Joseph Drouhin", g:"Pinot Noir", v:"Santenay, Cote d'Or, Burgundy", b:125},
      {n:"Sokol Blosser", g:"Pinot Noir", v:"Dundee Hills, Willamette Valley, Oregon", b:84},
      {n:"Tenuta delle Terre Nere 'San Lorenzo'", g:"Nerello Mescalese", v:"Mt. Etna, Sicily, Italy", b:118},
      {n:"Annamaria Sala Sicilia Rosso", g:"Nero d'Avola", v:"Sicily, Italy", h:5, gl:11, b:38},
      {n:"Domaine de Noire 'Soif de Tendresse'", g:"Cabernet Franc", v:"Chinon, Loire Valley, France", h:9, gl:17, b:60},
      {n:"Decoy", g:"Merlot", v:"California", h:6, gl:11, b:39},
      {n:"Twenty Bench", g:"Cabernet Sauvignon", v:"North Coast, California", h:6, gl:11, b:39},
      {n:"Daou", g:"Cabernet Sauvignon", v:"Paso Robles, California", h:7, gl:15, b:52},
      {n:"Caymus", g:"Cabernet Sauvignon", v:"Napa Valley, California", b:130},
      {n:"Chappellet 'Signature'", g:"Cabernet Sauvignon", v:"Napa Valley, California", b:184},
      {n:"Familia Bonfanti", g:"Malbec", v:"Uco Valley, Mendoza, Argentina", h:9, gl:16, b:56},
      {n:"Domaine Duseigneur 'Catarina'", g:"Grenache, Syrah", v:"Chateauneuf-du-Pape, Cotes du Rhone, France", b:110},
      {n:"Emilio Moro Estate", g:"Tempranillo", v:"Ribera del Duero, Spain", b:72},
      {n:"Tenuta La Fuga Brunello di Montalcino", g:"Sangiovese", v:"Montalcino, Tuscany, Italy", b:145}
    ]}
  ]}
};
function STEAK(){return [
  {g:"House butter", t:"one", c:[{l:"Steak butter"},{l:"Rosemary butter"},{l:"Garlic butter"},{l:"BBQ butter"}]},
  {g:"Top your steak", t:"many", c:[
    {l:"Jumbo Gulf shrimp", p:10},{l:"Orleanian style — shrimp sauteed in BBQ butter", p:10},
    {l:"Lump crab meat", mp:1},{l:"Emperor style — lump crab, meuniere and bearnaise", mp:1}]}
];}
function SIDE(){return {g:"Choose a side", t:"one", c:[{l:"French fries"},{l:"Onion rings"},{l:"Side house salad"},{l:"Cup of soup", p:5}]};}
function SAUCE(){return {g:"Dressed with", t:"one", c:[{l:"Mayonnaise"},{l:"Remoulade"}]};}
function KIDSIDE(){return {g:"Choose a side", t:"one", c:[{l:"French fries"},{l:"Green beans"}]};}
