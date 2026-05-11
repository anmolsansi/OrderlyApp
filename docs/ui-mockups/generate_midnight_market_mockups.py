from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(__file__).parent
W, H = 1440, 1000
COLORS = {
    'bg': '#07111f',
    'bg2': '#0b1728',
    'panel': '#101c2e',
    'panel2': '#13233a',
    'muted': '#8ea0b8',
    'text': '#f8fafc',
    'subtle': '#1f334f',
    'accent': '#22c55e',
    'accent2': '#14b8a6',
    'warn': '#f59e0b',
    'line': '#263a58',
    'danger': '#fb7185',
}


def svg_start(title):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="title desc">
<title>{escape(title)}</title>
<desc>Midnight Market themed OrderlyApp UI mockup.</desc>
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#07111f"/>
    <stop offset="0.55" stop-color="#0b1728"/>
    <stop offset="1" stop-color="#03140f"/>
  </linearGradient>
  <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#22c55e"/>
    <stop offset="1" stop-color="#14b8a6"/>
  </linearGradient>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000" flood-opacity="0.35"/>
  </filter>
</defs>
<rect width="{W}" height="{H}" fill="url(#bg)"/>
<circle cx="1180" cy="120" r="220" fill="#22c55e" opacity="0.08"/>
<circle cx="120" cy="860" r="260" fill="#14b8a6" opacity="0.07"/>
'''


def rect(x,y,w,h,fill=None,stroke=None,r=24,opacity=1,extra=''):
    fill = fill or COLORS['panel']
    stroke_attr = f' stroke="{stroke}" stroke-width="1"' if stroke else ''
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" opacity="{opacity}"{stroke_attr} {extra}/>'


def text(x,y,s,size=24,fill=None,weight=500,anchor='start',opacity=1):
    fill = fill or COLORS['text']
    return f'<text x="{x}" y="{y}" fill="{fill}" font-family="Inter, Arial, sans-serif" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" opacity="{opacity}">{escape(s)}</text>'


def pill(x,y,s,fill=None,w=None):
    w = w or max(86, len(s)*9+28)
    return rect(x,y,w,36,fill or '#12283e',COLORS['line'],18) + text(x+w/2,y+24,s,14,COLORS['text'],600,'middle')


def nav(active='Home'):
    items = ['Home','Search','Menu','Cart','Orders']
    out = rect(56,34,1328,68,'#081626','#20324e',34,1, 'filter="url(#shadow)"')
    out += text(88,78,'OrderlyApp',25,COLORS['text'],800)
    out += rect(64,47,36,36,'url(#accent)',None,18) + text(82,72,'O',19,'#03140f',900,'middle')
    x=610
    for item in items:
        if item==active:
            out += pill(x-18,50,item,'#123724')
        else:
            out += text(x,73,item,15,COLORS['muted'],600)
        x += 92
    out += rect(1228,48,126,40,'#123724','#1f7a45',20) + text(1291,74,'Cart · 2',15,'#d1fae5',800,'middle')
    return out


def phone(x,y):
    out = rect(x,y,320,610,'#07111f','#2b3f5d',44,1,'filter="url(#shadow)"')
    out += rect(x+18,y+22,284,566,'#f8fafc',None,32)
    out += text(x+46,y+65,'Now',14,'#111827',700)
    out += text(x+250,y+65,'28m',14,'#111827',800,'middle')
    out += rect(x+42,y+90,236,250,'#ecfdf5','#d1fae5',28)
    out += text(x+88,y+178,'Home',20,'#0f172a',800,'middle')
    out += text(x+160,y+230,'Driver',20,'#0f766e',800,'middle')
    out += text(x+232,y+178,'Pizza',20,'#166534',800,'middle')
    out += f'<path d="M{x+90} {y+198} C{x+140} {y+270}, {x+180} {y+125}, {x+236} {y+198}" stroke="#22c55e" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="12 12"/>'
    out += rect(x+42,y+370,236,148,'#ffffff','#e5e7eb',24)
    out += text(x+62,y+410,"Mario's Pizza Lab",18,'#111827',800)
    out += text(x+62,y+440,'Pepperoni Feast',14,'#64748b',600)
    out += rect(x+62,y+468,196,10,'#dcfce7',None,5)
    out += rect(x+62,y+468,122,10,'#22c55e',None,5)
    out += text(x+62,y+505,'Track order',14,'#16a34a',800)
    return out


def card_restaurant(x,y,w,name,meta,tags,highlight=False):
    out = rect(x,y,w,150,'#101c2e' if not highlight else '#102b24','#263a58' if not highlight else '#22c55e',24)
    out += rect(x+22,y+24,102,102,'#17304a',None,22)
    out += text(x+73,y+80,'Pizza',16,'#d1fae5',900,'middle')
    out += text(x+148,y+44,name,23,COLORS['text'],800)
    out += text(x+148,y+75,meta,15,COLORS['muted'],600)
    tx=x+148
    for t in tags:
        out += pill(tx,y+96,t,'#0d2d22')
        tx += max(86, len(t)*9+28)+8
    return out


def menu_item(x,y,w,name,desc,price,pop=False):
    out = rect(x,y,w,128,'#101c2e','#263a58',22)
    out += rect(x+20,y+22,84,84,'#17304a',None,20)
    out += text(x+62,y+71,'Item',14,'#d1fae5',900,'middle')
    out += text(x+124,y+42,name,21,COLORS['text'],800)
    out += text(x+124,y+70,desc,14,COLORS['muted'],500)
    out += text(x+124,y+102,price,17,'#d1fae5',800)
    if pop: out += pill(x+w-122,y+22,'Popular','#123724',96)
    out += rect(x+w-64,y+76,40,40,'url(#accent)',None,20) + text(x+w-44,y+103,'+',24,'#03140f',900,'middle')
    return out


def footer_label(name):
    return text(56,970,name,15,COLORS['muted'],700)


def write(name, body):
    (OUT/name).write_text(body+'</svg>\n')

# 01 homepage
s=svg_start('Homepage mockup - Midnight Market')+nav('Home')
s+=text(72,165,'Midnight Market theme',15,'#86efac',800)
s+=text(72,232,'Pizza delivery now.',66,COLORS['text'],900)
s+=text(72,302,'Every cuisine next.',66,COLORS['text'],900)
s+=text(72,356,'A DoorDash-style marketplace homepage: search, favorites, famous restaurants, offers, and a scalable cuisine rail for v2.',22,COLORS['muted'],500)
s+=rect(72,400,760,72,'#0b1728','#2a415f',28)
s+=text(104,446,'Search pizza, pepperoni, wood fired, late night...',20,'#cbd5e1',500)
s+=rect(680,412,132,48,'url(#accent)',None,24)+text(746,443,'Search',17,'#03140f',900,'middle')
for i,p in enumerate(['Pizza','Fast delivery','Top rated','Wood fired','Open late']): s+=pill(72+i*148,492,p,'#102b24')
s+=text(72,590,'Famous near you',30,COLORS['text'],850)
s+=card_restaurant(72,620,380,"Mario's Pizza Lab",'4.8 · 20–30 min · $1.99',['Thin crust','Popular'],True)
s+=card_restaurant(476,620,380,'Neapolitan Nova','4.9 · 30–40 min · $2.99',['Premium','Wood fired'])
s+=card_restaurant(880,620,380,'Slice Station','4.6 · 15–25 min · $2.49',['Fast','NY style'])
s+=text(72,825,'Favorites',28,COLORS['text'],850)
s+=rect(72,850,250,76,'#102b24','#1f7a45',22)+text(100,895,"Mario's Pizza Lab",18,COLORS['text'],800)+text(250,895,'28m',15,COLORS['muted'],700)
s+=rect(342,850,250,76,'#102b24','#1f7a45',22)+text(370,895,'Neapolitan Nova',18,COLORS['text'],800)+text(520,895,'35m',15,COLORS['muted'],700)
s+=phone(1010,176)+footer_label('01 · Homepage')
write('01-homepage.svg',s)

# 02 restaurant results
s=svg_start('Restaurant search results mockup - Midnight Market')+nav('Search')
s+=text(72,150,'Search results for “pizza near me”',42,COLORS['text'],900)
s+=rect(72,185,820,60,'#0b1728','#2a415f',24)+text(104,224,'pizza near me',20,'#e2e8f0',600)+rect(760,196,108,38,'url(#accent)',None,19)+text(814,222,'Search',15,'#03140f',900,'middle')
s+=rect(72,280,260,580,'#101c2e','#263a58',28)
s+=text(100,326,'Filters',27,COLORS['text'],850)
for i,p in enumerate(['Open now','Under 30 min','Top rated','Free delivery','Wood fired','NY style']): s+=pill(100,360+i*58,p,'#102b24',170)
s+=text(380,300,'Pizza restaurants',32,COLORS['text'],850)
s+=text(382,332,'12 restaurants · sorted by recommended',17,COLORS['muted'],600)
names=[("Mario's Pizza Lab",'4.8 · 20–30 min · $1.99',['Thin crust','Popular']),('Slice Station','4.6 · 15–25 min · $2.49',['Fast','NY style']),('Dough & Co.','4.7 · 25–35 min · $0.99',['Best value','Wood fired']),('Chicago Square Cut','4.5 · 30–40 min · $1.49',['Deep dish','Family'])]
for i,(n,m,t) in enumerate(names): s+=card_restaurant(380,365+i*170,820,n,m,t,i==0)
s+=rect(1240,188,110,42,'#102b24','#1f7a45',21)+text(1295,216,'Map',15,'#d1fae5',800,'middle')+footer_label('02 · Search opens restaurant list page')
write('02-restaurant-results.svg',s)

# 03 menu
s=svg_start('Restaurant menu mockup - Midnight Market')+nav('Menu')
s+=rect(72,130,1296,210,'#102b24','#1f7a45',34)
s+=text(110,190,"Mario's Pizza Lab",52,COLORS['text'],900)
s+=text(112,230,'Pizza · 4.8 stars · 20–30 min · $1.99 delivery · Open late',20,'#d1fae5',650)
s+=pill(112,260,'Thin crust','#123724')+pill(230,260,'Popular','#123724')+pill(340,260,'Group order','#123724',128)
s+=rect(1120,168,170,56,'url(#accent)',None,28)+text(1205,204,'Favorite',18,'#03140f',900,'middle')
for i,p in enumerate(['Popular','Pizza','Sides','Drinks','Dessert']): s+=pill(72+i*124,370,p,'#102b24' if i==0 else '#101c2e',106)
s+=text(72,465,'Popular items',32,COLORS['text'],850)
s+=menu_item(72,500,610,'Pepperoni Feast','Double pepperoni, mozzarella, red sauce','$14.99',True)
s+=menu_item(72,650,610,'Classic Margherita','Tomato, mozzarella, basil, olive oil','$12.99',True)
s+=menu_item(72,800,610,'Garden Supreme','Peppers, mushrooms, onions, olives','$13.99')
s+=text(750,465,'Pizza',32,COLORS['text'],850)
s+=menu_item(750,500,610,'Truffle Burrata Cloud','Burrata, truffle oil, roasted mushrooms','$18.99')
s+=menu_item(750,650,610,'Hot Honey Soppressata','Soppressata-style pepperoni, hot honey','$18.99',True)
s+=menu_item(750,800,610,'SoHo White Pie','Ricotta, mozzarella, garlic confit','$16.99')+footer_label('03 · Restaurant menu page')
write('03-restaurant-menu.svg',s)

# 04 item customization
s=svg_start('Item customization mockup - Midnight Market')+nav('Menu')
s+=text(72,150,'Customize item',42,COLORS['text'],900)
s+=rect(72,190,540,620,'#101c2e','#263a58',32)
s+=rect(112,230,460,260,'#17304a',None,32)+text(342,370,'Pepperoni Feast',30,'#d1fae5',900,'middle')
s+=text(112,545,'Pepperoni Feast',36,COLORS['text'],900)
s+=text(112,585,'Double pepperoni, mozzarella, red sauce.',19,COLORS['muted'],600)
s+=text(112,635,'Base price',17,COLORS['muted'],600)+text(540,635,'$14.99',20,COLORS['text'],850,'end')
s+=rect(112,680,460,64,'url(#accent)',None,24)+text(342,721,'Add to cart · $19.49',20,'#03140f',900,'middle')
s+=rect(660,190,708,620,'#101c2e','#263a58',32)
s+=text(700,245,'Choose size',28,COLORS['text'],850)
for i,(name,price,on) in enumerate([('Small','Included',False),('Medium','+$3.00',False),('Large','+$5.00',True)]):
    y=280+i*74
    s+=rect(700,y,608,56,'#102b24' if on else '#0b1728','#22c55e' if on else '#263a58',18)
    s+=text(730,y+36,name,18,COLORS['text'],750)+text(1278,y+36,price,16,COLORS['muted'],650,'end')
s+=text(700,550,'Toppings',28,COLORS['text'],850)
for i,p in enumerate(['Extra cheese','Jalapeños','Mushrooms','Hot honey','Basil','Garlic confit']): s+=pill(700+(i%3)*190,585+(i//3)*58,p,'#102b24' if i in [0,1,3] else '#0b1728',170)
s+=text(700,750,'Special instructions',18,COLORS['muted'],650)+rect(700,770,608,72,'#0b1728','#263a58',18)+text(728,815,'Cut into squares, please',17,'#cbd5e1',500)+footer_label('04 · Item customization page')
write('04-item-customization.svg',s)

# 05 checkout
s=svg_start('Checkout and payment mockup - Midnight Market')+nav('Cart')
s+=text(72,150,'Checkout',46,COLORS['text'],900)
s+=rect(72,190,760,680,'#101c2e','#263a58',32)
s+=text(112,250,'Your cart',32,COLORS['text'],850)
s+=menu_item(112,290,660,'Pepperoni Feast','Large · Extra cheese · Jalapeños · Hot honey','$19.49',False)
s+=menu_item(112,440,660,'Classic Margherita','Medium · Fresh basil','$15.99',False)
s+=rect(112,626,660,1,COLORS['line'],None,0)
for i,(k,v) in enumerate([('Subtotal','$35.48'),('Delivery fee','$1.99'),('Service fee','$2.35'),('Promo','-$5.00'),('Total','$34.82')]):
    y=675+i*42
    s+=text(112,y,k,18,COLORS['text'] if k=='Total' else COLORS['muted'],800 if k=='Total' else 600)
    s+=text(772,y,v,20,COLORS['text'] if k=='Total' else COLORS['muted'],850,'end')
s+=rect(880,190,488,680,'#101c2e','#263a58',32)
s+=text(920,250,'Payment review',32,COLORS['text'],850)
for i,(k,v) in enumerate([('Delivery address','123 Demo Street'),('Drop-off','Leave at door'),('Payment','Visa •••• 4242'),('ETA','28–35 min')]):
    y=292+i*100
    s+=rect(920,y,408,72,'#0b1728','#263a58',20)+text(948,y+28,k,15,COLORS['muted'],650)+text(948,y+54,v,20,COLORS['text'],800)
s+=rect(920,735,408,64,'url(#accent)',None,24)+text(1124,776,'Place order',21,'#03140f',900,'middle')+footer_label('05 · Checkout and payment review page')
write('05-checkout-payment.svg',s)

# 06 confirmation
s=svg_start('Finalized order mockup - Midnight Market')+nav('Orders')
s+=rect(342,140,756,280,'#102b24','#22c55e',42,1,'filter="url(#shadow)"')
s+=rect(662,184,116,116,'url(#accent)',None,58)+text(720,260,'✓',64,'#03140f',900,'middle')
s+=text(720,350,'Order placed!',48,COLORS['text'],900,'middle')
s+=text(720,385,'Mock order ORD-PIZZA is confirmed. ETA 28 minutes.',20,'#d1fae5',650,'middle')
s+=rect(170,500,1100,260,'#101c2e','#263a58',34)
s+=text(218,560,'Order progress',32,COLORS['text'],850)
steps=['Placed','Confirmed','Preparing','Out for delivery','Delivered']
for i,step in enumerate(steps):
    x=250+i*220
    active=i<3
    s+=rect(x,620,58,58,'url(#accent)' if active else '#0b1728','#22c55e' if active else '#263a58',29)
    s+=text(x+29,658,'✓' if active else str(i+1),25,'#03140f' if active else COLORS['muted'],900,'middle')
    if i<4: s+=rect(x+62,647,148,6,'#22c55e' if i<2 else '#263a58',None,3)
    s+=text(x+29,720,step,17,COLORS['text'] if active else COLORS['muted'],750,'middle')
s+=rect(342,810,336,70,'#0b1728','#263a58',24)+text(510,854,'View receipt',19,COLORS['text'],800,'middle')
s+=rect(710,810,386,70,'url(#accent)',None,24)+text(903,854,'Reorder pizza',19,'#03140f',900,'middle')+footer_label('06 · Finalized order page')
write('06-order-confirmation.svg',s)
