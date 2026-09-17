-- Pins, provenance and lock flags
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;
ALTER TABLE public.master_items ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;
ALTER TABLE public.master_items ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'custom';
ALTER TABLE public.master_items ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.recipe_versions ADD COLUMN IF NOT EXISTS description text;

CREATE INDEX IF NOT EXISTS recipes_pinned_idx ON public.recipes (is_pinned) WHERE is_pinned;
CREATE INDEX IF NOT EXISTS master_items_pinned_idx ON public.master_items (is_pinned) WHERE is_pinned;
CREATE INDEX IF NOT EXISTS master_items_category_idx ON public.master_items (category);

-- Normalise legacy categories onto the PRD taxonomy
UPDATE public.master_items SET category = CASE category
  WHEN 'grain' THEN 'Cereals'
  WHEN 'vegetable' THEN 'Vegetables'
  WHEN 'fruit' THEN 'Fruits'
  WHEN 'legume' THEN 'Pulses'
  WHEN 'dairy' THEN 'Dairy'
  WHEN 'meat' THEN 'Egg, Meat & Fish'
  WHEN 'fish' THEN 'Egg, Meat & Fish'
  WHEN 'egg' THEN 'Egg, Meat & Fish'
  WHEN 'fat' THEN 'Fats & Oils'
  WHEN 'other' THEN 'Other'
  ELSE category END;

-- ICMR-NIN 2020 1–3y reference row (defaults live in code; row makes the band editable/visible)
INSERT INTO public.rda_settings (age_band, nutrients)
VALUES ('1-3y', '{}'::jsonb)
ON CONFLICT DO NOTHING;

-- Seed reference catalog (IFCT 2017 / USDA FDC approximations, per 100 g edible portion; amino acids mg per g protein)
INSERT INTO public.master_items (name, category, source, is_locked, nutrients, amino_acids)
SELECT
  v.name, v.category, v.source, true,
  jsonb_strip_nulls(jsonb_build_object(
    'kcal', v.kcal, 'protein_g', v.pro, 'fat_g', v.fat, 'carb_g', v.carb, 'fiber_g', v.fib, 'sugar_g', v.sug,
    'sodium_mg', v.na, 'iron_mg', v.fe, 'calcium_mg', v.ca, 'zinc_mg', v.zn, 'vitc_mg', v.vc, 'vita_ug', v.va,
    'folate_ug', v.fol, 'vitd_ug', v.vd, 'vitb12_ug', v.b12)),
  jsonb_build_object('his', v.his, 'ile', v.ile, 'leu', v.leu, 'lys', v.lys, 'saa', v.saa, 'aaa', v.aaa, 'thr', v.thr, 'trp', v.trp, 'val', v.val)
FROM (VALUES
-- name, category, source, kcal, pro, fat, carb, fib, sug, na, fe, ca, zn, vc, va, fol, vd, b12, his, ile, leu, lys, saa, aaa, thr, trp, val
('Rice, raw, milled','Cereals','IFCT',356,7.9,0.5,78.2,2.8,0.1,2,0.6,7.5,1.2,0,0,9,0,0,24,40,82,36,38,90,35,12,58),
('Rice, brown, raw','Cereals','IFCT',346,9.2,1.2,74.8,4.4,0.6,4,1.1,10,1.9,0,0,17,0,0,25,42,84,38,40,92,36,13,60),
('Rice, parboiled','Cereals','IFCT',349,7.8,0.6,77.2,3.7,0.1,3,1.0,8,1.3,0,0,8,0,0,24,40,82,36,38,90,35,12,58),
('Flattened rice (poha)','Cereals','IFCT',348,7.3,0.9,77.3,1.5,0.4,4,2.7,17,1.3,0,0,7,0,0,24,40,82,36,38,90,35,12,58),
('Puffed rice (murmura)','Cereals','IFCT',325,7.5,0.1,73.6,3.6,0.2,7,6.6,23,1.5,0,0,8,0,0,24,40,82,36,38,90,35,12,58),
('Wheat flour, whole (atta)','Cereals','IFCT',320,10.6,1.5,64.2,11.2,1.3,6,4.1,30,2.9,0,0,30,0,0,23,35,68,26,38,78,28,12,43),
('Wheat flour, refined (maida)','Cereals','IFCT',351,10.4,0.8,74.3,2.8,0.9,4,2.4,20,0.8,0,0,26,0,0,23,35,68,25,38,78,28,12,43),
('Semolina (suji / rava)','Cereals','IFCT',334,10.4,0.8,71.2,4.5,0.5,5,1.9,17,1.1,0,0,24,0,0,23,35,68,25,38,78,28,12,43),
('Broken wheat (dalia)','Cereals','IFCT',342,11.9,1.5,69.4,9.4,0.9,5,3.6,37,2.6,0,0,33,0,0,23,35,68,26,38,78,28,12,43),
('Oats, rolled','Cereals','USDA',379,13.2,6.5,67.7,10.1,1.0,6,4.3,52,3.6,0,0,32,0,0,22,38,74,42,45,89,33,13,53),
('Maize (corn) flour','Cereals','IFCT',334,8.8,3.8,68.9,11.9,1.0,4,2.5,8,2.0,0,10,29,0,0,27,36,125,28,35,88,37,7,50),
('Barley, whole','Cereals','IFCT',316,10.9,1.3,61.3,15.6,0.8,10,2.0,29,2.1,0,0,26,0,0,22,36,68,36,40,86,34,12,50),
('Finger millet (ragi)','Millets','IFCT',320,7.2,1.9,66.8,11.2,0.6,11,4.6,364,2.5,0,0,34,0,0,21,41,120,29,40,90,38,14,63),
('Finger millet flour, malted (sprouted ragi)','Millets','IFCT',325,7.4,1.7,70.1,8.5,1.2,10,4.2,340,2.4,0,0,38,0,0,21,41,120,31,40,90,38,14,63),
('Pearl millet (bajra)','Millets','IFCT',348,10.9,5.4,61.8,11.5,0.7,10,6.4,27,2.8,0,0,36,0,0,22,42,110,30,38,84,36,15,55),
('Sorghum (jowar)','Millets','IFCT',334,10.0,1.7,67.7,10.2,0.9,7,3.9,28,2.0,0,0,39,0,0,21,40,140,21,32,85,31,10,50),
('Foxtail millet (kangni)','Millets','IFCT',331,12.3,4.3,60.1,8.0,0.7,5,2.8,31,2.4,0,0,15,0,0,22,45,130,17,38,90,35,12,55),
('Little millet (kutki)','Millets','IFCT',346,10.1,3.9,65.6,7.7,0.6,6,1.3,16,1.8,0,0,36,0,0,21,42,115,25,36,88,33,11,54),
('Kodo millet','Millets','IFCT',332,8.9,2.6,66.2,6.4,0.5,5,2.3,15,1.7,0,0,40,0,0,21,40,110,25,36,86,33,11,52),
('Barnyard millet (sanwa)','Millets','IFCT',307,6.2,2.2,65.5,9.8,0.4,5,5.0,20,3.0,0,0,32,0,0,22,42,105,28,38,86,34,12,55),
('Proso millet','Millets','IFCT',341,12.5,1.1,70.4,2.2,0.5,8,0.8,14,1.4,0,0,25,0,0,22,45,125,20,42,88,32,10,55),
('Amaranth grain (rajgira)','Millets','IFCT',356,14.6,5.7,59.9,7.0,1.7,15,8.0,181,2.9,0,0,42,0,0,25,38,58,55,45,75,38,11,45),
('Amaranth, sprouted','Millets','IFCT',340,15.0,5.5,58.0,7.5,2.0,14,7.8,175,2.8,2,0,50,0,0,25,38,58,57,45,75,38,11,45),
('Moong dal (green gram, dehusked)','Pulses','IFCT',334,24.5,1.2,59.9,8.2,2.1,20,4.4,80,2.9,0,5,140,0,0,28,42,78,70,22,85,33,10,52),
('Green gram, whole (sabut moong)','Pulses','IFCT',327,22.5,1.2,58.8,17.0,2.5,16,4.1,90,2.6,0,6,143,0,0,28,42,78,70,22,85,33,10,52),
('Masoor dal (red lentil)','Pulses','IFCT',322,24.4,0.8,57.9,10.3,1.9,9,7.5,60,3.3,0,3,90,0,0,27,43,72,68,22,82,35,9,50),
('Toor dal (pigeon pea)','Pulses','IFCT',330,21.7,1.5,58.3,9.1,2.0,12,3.9,74,2.7,0,6,110,0,0,32,37,72,68,23,88,34,9,46),
('Chana dal (bengal gram, dehusked)','Pulses','IFCT',345,21.6,5.3,56.1,11.9,3.0,20,4.7,64,3.2,0,5,110,0,0,27,43,72,67,25,80,36,9,45),
('Chickpea, whole (kabuli chana)','Pulses','IFCT',330,18.8,5.3,55.1,12.5,3.5,24,6.0,150,3.0,3,4,120,0,0,27,43,72,67,25,80,36,9,45),
('Urad dal (black gram, dehusked)','Pulses','IFCT',327,23.1,1.5,58.6,10.0,1.6,17,5.7,86,3.1,0,5,120,0,0,26,42,80,64,25,88,35,9,52),
('Rajma (kidney bean)','Pulses','IFCT',321,20.8,1.4,56.8,15.2,2.2,12,6.0,110,2.9,1,1,300,0,0,27,44,80,68,23,85,40,11,52),
('Soybean, whole','Pulses','IFCT',380,37.8,19.4,20.5,21.5,5.0,13,8.9,195,3.3,0,3,210,0,0,26,45,78,62,26,86,38,13,47),
('Horse gram (kulthi)','Pulses','IFCT',321,21.7,0.6,57.2,7.9,2.0,11,8.8,269,2.8,1,3,120,0,0,27,42,78,60,22,80,34,8,50),
('Cowpea (lobia)','Pulses','IFCT',323,22.0,1.5,54.5,13.0,3.1,14,7.6,80,3.6,0,2,300,0,0,30,40,76,67,26,86,37,11,48),
('Field bean (val)','Pulses','IFCT',319,20.5,1.3,58.0,11.5,2.5,15,3.7,58,2.4,0,3,110,0,0,28,42,78,66,20,84,36,10,50),
('Whole milk powder','Dairy','IFCT',496,25.8,26.7,38.4,0,38.4,370,0.5,912,3.3,8,258,37,0.3,3.2,27,55,98,79,33,100,45,14,66),
('Skimmed milk powder','Dairy','IFCT',362,36.2,0.8,52.0,0,52.0,535,0.3,1257,4.1,7,0,50,0,4.0,27,55,98,79,33,100,45,14,66),
('Cow milk, whole, fluid','Dairy','IFCT',61,3.2,3.3,4.8,0,4.8,44,0.1,113,0.4,1,46,5,0.1,0.5,27,55,98,79,33,100,45,14,66),
('Buffalo milk, whole','Dairy','IFCT',97,3.8,6.9,5.2,0,5.2,52,0.1,169,0.5,1,62,7,0.1,0.4,27,55,98,79,33,100,45,14,66),
('Curd (dahi), whole milk','Dairy','IFCT',61,3.1,3.3,4.7,0,4.7,46,0.1,121,0.6,1,27,7,0.1,0.4,27,55,98,79,33,100,45,14,66),
('Paneer (cottage cheese)','Dairy','IFCT',265,18.3,20.8,1.2,0,1.2,18,0.2,208,2.7,0,210,15,0.2,1.0,28,52,95,82,32,105,44,13,68),
('Ghee (clarified butter)','Fats & Oils','IFCT',900,0,99.8,0,0,0,2,0,4,0,0,684,0,1.5,0,0,0,0,0,0,0,0,0,0),
('Butter','Fats & Oils','IFCT',717,0.9,81.1,0.1,0,0.1,11,0,24,0.1,0,684,3,1.5,0.2,27,55,98,79,33,100,45,14,66),
('Sunflower oil','Fats & Oils','IFCT',884,0,100,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0),
('Groundnut oil','Fats & Oils','IFCT',884,0,100,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0),
('Coconut oil','Fats & Oils','IFCT',892,0,99.1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0),
('Rice bran oil','Fats & Oils','IFCT',884,0,100,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0),
('Almond','Nuts & Seeds','IFCT',609,18.4,58.5,10.4,13.0,4.2,1,4.1,228,3.4,0,0,64,0,0,26,37,70,29,25,85,30,11,42),
('Cashew nut','Nuts & Seeds','IFCT',582,18.8,44.0,31.1,3.5,5.9,12,5.9,45,5.6,0,0,42,0,0,23,43,79,48,40,80,34,15,60),
('Groundnut (peanut), raw','Nuts & Seeds','IFCT',520,23.7,39.5,20.5,9.5,4.2,6,3.5,51,2.9,0,0,110,0,0,25,35,65,36,24,92,28,10,42),
('Walnut','Nuts & Seeds','IFCT',671,14.9,64.3,11.0,6.4,2.6,2,2.4,89,3.0,1,0,98,0,0,23,40,75,27,35,80,36,12,48),
('Sesame seed (til)','Nuts & Seeds','IFCT',563,21.7,43.3,25.0,17.0,0.4,13,15.0,1283,7.1,0,4,97,0,0,26,38,68,27,52,87,37,15,49),
('Pumpkin seed','Nuts & Seeds','USDA',559,30.2,49.1,10.7,6.0,1.4,7,8.8,46,7.8,2,1,58,0,0,26,40,75,37,35,95,32,13,50),
('Flaxseed (alsi)','Nuts & Seeds','USDA',534,18.3,42.2,28.9,27.3,1.6,30,5.7,255,4.3,1,0,87,0,0,22,38,60,40,28,75,36,15,50),
('Chia seed','Nuts & Seeds','USDA',486,16.5,30.7,42.1,34.4,0,16,7.7,631,4.6,2,3,49,0,0,29,36,72,50,32,80,38,12,48),
('Fox nut (makhana)','Nuts & Seeds','IFCT',347,9.7,0.1,76.9,14.5,0.7,4,1.4,60,1.2,0,0,25,0,0,22,38,70,45,30,80,32,12,50),
('Coconut, fresh','Nuts & Seeds','IFCT',354,3.3,33.5,15.2,9.0,6.2,20,2.4,14,1.1,3,0,26,0,0,23,39,74,44,38,80,36,12,60),
('Carrot','Vegetables','IFCT',33,0.9,0.5,6.7,4.0,4.7,69,0.3,32,0.2,6,835,19,0,0,20,40,60,50,25,70,38,12,50),
('Spinach (palak)','Vegetables','IFCT',24,2.1,0.6,2.1,2.4,0.4,79,2.9,82,0.5,30,469,110,0,0,23,45,75,55,30,85,42,15,55),
('Pumpkin (kaddu)','Vegetables','IFCT',20,0.8,0.1,4.1,1.9,2.8,3,0.4,26,0.2,7,117,17,0,0,20,40,60,50,25,70,38,12,50),
('Potato','Vegetables','IFCT',69,1.6,0.3,14.6,1.7,0.9,3,0.5,10,0.3,20,0,17,0,0,20,42,62,58,28,75,38,13,55),
('Sweet potato (shakarkand)','Vegetables','IFCT',86,1.2,0.3,18.9,3.0,4.2,25,0.7,30,0.3,24,709,11,0,0,20,42,62,50,30,75,45,15,55),
('Bottle gourd (lauki)','Vegetables','IFCT',12,0.4,0.1,2.5,1.2,1.0,2,0.3,20,0.2,8,0,5,0,0,20,40,60,50,25,70,38,12,50),
('Beetroot','Vegetables','IFCT',36,1.7,0.1,6.8,2.8,6.8,60,1.0,18,0.4,10,2,80,0,0,20,40,60,50,25,70,38,12,50),
('Tomato','Vegetables','IFCT',20,0.9,0.5,3.0,1.6,2.6,5,0.4,10,0.2,27,42,15,0,0,20,40,60,50,25,70,38,12,50),
('Green peas','Vegetables','IFCT',81,7.2,0.4,11.6,5.7,5.7,2,1.5,25,1.2,20,38,65,0,0,25,45,75,72,22,85,40,10,50),
('Drumstick leaves (moringa)','Vegetables','IFCT',67,6.4,1.7,5.5,8.2,0.9,25,3.7,314,0.6,108,470,40,0,0,25,45,80,58,32,90,45,20,55),
('Banana, ripe','Fruits','IFCT',95,1.2,0.3,22.0,2.4,12.2,1,0.3,10,0.2,9,3,20,0,0,15,30,50,45,20,55,30,10,40),
('Apple','Fruits','IFCT',59,0.3,0.4,13.4,2.6,10.4,1,0.2,6,0.1,5,3,3,0,0,15,30,50,45,20,55,30,10,40),
('Papaya, ripe','Fruits','IFCT',35,0.5,0.1,7.7,2.6,5.9,7,0.3,17,0.1,43,47,37,0,0,15,30,50,45,20,55,30,10,40),
('Mango, ripe','Fruits','IFCT',50,0.5,0.4,11.2,1.8,10.0,1,0.2,10,0.1,40,60,32,0,0,15,30,50,45,20,55,30,10,40),
('Chikoo (sapota)','Fruits','IFCT',83,0.4,1.1,19.9,5.3,14.7,7,0.4,21,0.1,7,5,14,0,0,15,30,50,45,20,55,30,10,40),
('Dates, dried (khajur)','Fruits','IFCT',282,2.5,0.4,64.0,8.0,63.4,2,1.0,39,0.3,0,1,15,0,0,15,30,50,45,20,55,30,10,40),
('Raisins (kishmish)','Fruits','IFCT',299,3.1,0.5,72.4,3.7,59.2,11,1.9,50,0.2,2,0,5,0,0,20,30,50,40,20,55,30,10,40),
('Jaggery (gur)','Sweeteners','IFCT',383,0.4,0.1,95.0,0,84.0,30,2.6,80,0.3,0,0,0,0,0,0,0,0,0,0,0,0,0,0),
('Sugar, white','Sweeteners','IFCT',398,0,0,99.5,0,99.5,0,0.1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0),
('Egg, whole, hen, boiled','Egg, Meat & Fish','IFCT',155,13.0,10.6,1.1,0,1.1,124,1.2,50,1.1,0,149,44,2.2,1.1,24,55,86,70,55,94,47,17,68),
('Chicken, breast, cooked','Egg, Meat & Fish','USDA',165,31.0,3.6,0,0,0,74,1.0,15,1.0,0,6,4,0.1,0.3,30,48,75,85,38,72,42,12,50),
('Fish, rohu, cooked','Egg, Meat & Fish','IFCT',110,19.5,3.0,0,0,0,80,1.0,60,0.9,0,20,10,5.0,1.5,29,46,81,92,40,73,44,11,52),
('Sago (sabudana)','Cereals','IFCT',351,0.2,0.1,87.1,0.6,0,4,1.3,10,0.1,0,0,0,0,0,0,0,0,0,0,0,0,0,0)
) AS v(name, category, source, kcal, pro, fat, carb, fib, sug, na, fe, ca, zn, vc, va, fol, vd, b12, his, ile, leu, lys, saa, aaa, thr, trp, val)
WHERE NOT EXISTS (SELECT 1 FROM public.master_items m WHERE lower(m.name) = lower(v.name));