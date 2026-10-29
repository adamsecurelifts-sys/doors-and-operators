import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from '../src/lib/db';
async function main(){const pool=db();const c=await pool.getConnection();try{await c.beginTransaction();await c.query(`INSERT IGNORE INTO warehouses(code,name) VALUES('MAIN','Main warehouse')`);await c.query(`INSERT IGNORE INTO price_lists(name) VALUES('Standard wholesale')`);const items=[
['DOOR-16X7-STEEL','Steel Raised Panel Garage Door 16 x 7','Garage Doors','Insulated steel sectional door, white, standard track.',749.00],
['OP-CHAIN-1HP','1 HP Chain Drive Operator','Operators & Motors','Residential chain drive operator with two remotes.',219.00],
['SPR-TORS-218-28','2-1/8 in x 28 in Torsion Spring','Springs','Oil tempered torsion spring, verify wire size and wind before use.',42.50],
['ROL-2IN-10PK','2 in Nylon Roller, 10 pack','Rollers','Sealed bearing nylon rollers for residential doors.',29.90],
['CAB-7FT-PAIR','7 ft Lift Cable Pair','Cables','Aircraft cable set with loop ends for residential doors.',18.75],
['HINGE-14G-10PK','14 Gauge Center Hinge, 10 pack','Parts','Heavy duty galvanized hinge set.',23.40],
];for(const [sku,name,category,description,price] of items){await c.query(`INSERT IGNORE INTO products(sku,name,category,description,base_price) VALUES(?,?,?,?,?)`,[sku,name,category,description,price]);const [[p]]=await c.query<any[]>(`SELECT id FROM products WHERE sku=?`,[sku]);const [[w]]=await c.query<any[]>(`SELECT id FROM warehouses WHERE code='MAIN'`);await c.query(`INSERT IGNORE INTO inventory_balances(warehouse_id,product_id,quantity) VALUES(?,?,0)`,[w.id,p.id])}await c.commit();console.log('Seeded sample catalog and main warehouse with zero inventory')}catch(e){await c.rollback();throw e}finally{c.release();await pool.end()}}
main().catch(e=>{console.error(e);process.exitCode=1});
