#!/usr/bin/env python3
"""
Download SVG chemical structure diagrams of neurotransmitters, hormones,
and psychoactive / psychedelic substances from Wikipedia / Wikimedia Commons.

Aims for hundreds of SVGs by combining:
  1. A curated list of ~600 named chemicals → Wikipedia article images (SVG preferred).
  2. Wikimedia Commons category crawl (--commons flag) for additional bulk SVGs.

Usage:
  python download_neuro_structures.py                   # full curated list
  python download_neuro_structures.py --category psychedelics
  python download_neuro_structures.py --commons         # also crawl Commons categories
  python download_neuro_structures.py --list            # print chemical names and exit
  python download_neuro_structures.py --list-categories # print available categories

All files go to ./neuro_structures/<category>/<name>.svg  (or .png fallback).
Already-downloaded files are skipped automatically.
"""

import argparse
import sys
import time
from pathlib import Path
from urllib.parse import quote as url_quote

import requests

# ── API endpoints ─────────────────────────────────────────────────────────────

WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
COMMONS_API   = "https://commons.wikimedia.org/w/api.php"
HEADERS = {"User-Agent": "NeuroChemSVGDownloader/1.0 (educational; open-source project)"}

# ── Curated chemical list ─────────────────────────────────────────────────────
# Wikipedia article titles are used; common names / redirects both work.

CHEMICALS: dict[str, list[str]] = {

    "neurotransmitters": [
        # Monoamines
        "Dopamine", "Serotonin", "Norepinephrine", "Epinephrine", "Histamine",
        "Melatonin", "Phenethylamine", "Tyramine", "Tryptamine", "Agmatine",
        # Amino-acid neurotransmitters
        "Gamma-aminobutyric acid", "Glutamic acid", "Glycine", "Aspartic acid",
        "Taurine", "D-serine", "Beta-alanine", "N-Acetylaspartylglutamic acid",
        # Cholinergic
        "Acetylcholine", "Choline",
        # Purines
        "Adenosine", "ATP", "ADP",
        # Neuropeptides
        "Substance P", "Neuropeptide Y", "Enkephalin", "Beta-endorphin",
        "Dynorphin", "Neurotensin", "Somatostatin", "Cholecystokinin",
        "Galanin", "Vasoactive intestinal peptide", "Orexin", "Nociceptin",
        "Calcitonin gene-related peptide", "Endorphin",
        # Endocannabinoids
        "Anandamide", "2-Arachidonoylglycerol", "Noladin ether",
        # Gasotransmitters
        "Nitric oxide", "Carbon monoxide", "Hydrogen sulfide",
        # Trace amines
        "N,N-Dimethyltryptamine", "Octopamine", "Synephrine",
    ],

    "hormones_steroids": [
        # Androgens
        "Testosterone", "Dihydrotestosterone", "Androstenedione", "Androstenediol",
        "Dehydroepiandrosterone", "Androsterone", "Androstanedione",
        "Androstanediol", "Androstanolone", "Etiocholanolone",
        # Estrogens
        "Estradiol", "Estrone", "Estriol", "Estetrol", "Ethinylestradiol",
        "Equilin", "Equilenin",
        # Progestogens
        "Progesterone", "Pregnenolone", "17-Hydroxyprogesterone",
        "17-Hydroxypregnenolone", "11-Deoxycortisol", "17-Hydroxypregnenolone",
        # Glucocorticoids
        "Cortisol", "Cortisone", "Corticosterone", "11-Deoxycortisol",
        "Prednisolone", "Dexamethasone", "Triamcinolone", "Prednisone",
        "Budesonide", "Betamethasone",
        # Mineralocorticoids
        "Aldosterone", "Fludrocortisone", "Deoxycorticosterone",
        # Neurosteroids
        "Allopregnanolone", "Pregnanolone", "Tetrahydrodeoxycorticosterone",
        "Dehydroepiandrosterone sulfate",
    ],

    "hormones_peptide": [
        "Insulin", "Glucagon", "Somatostatin", "Ghrelin", "Leptin",
        "Oxytocin", "Vasopressin", "Melatonin", "Thyroxine", "Triiodothyronine",
        "Calcitonin", "Angiotensin", "Bradykinin", "Erythropoietin",
        "Prolactin", "Relaxin", "Gastrin", "Secretin", "Motilin",
        "Vasoactive intestinal peptide", "Glucagon-like peptide-1", "Amylin",
        # Eicosanoids
        "Prostaglandin E2", "Prostaglandin F2alpha", "Thromboxane A2",
        "Prostacyclin", "Leukotriene B4", "Leukotriene E4",
        "12-Hydroxyeicosatetraenoic acid", "Arachidonic acid",
    ],

    "stimulants": [
        # Cathinones
        "Cathinone", "Cathine", "Methcathinone", "Mephedrone",
        "Methylenedioxypyrovalerone", "Alpha-Pyrrolidinopentiophenone",
        "4-Methylmethcathinone",
        # Amphetamines
        "Amphetamine", "Methamphetamine", "Levoamphetamine", "Dextroamphetamine",
        "Phentermine", "Benzphetamine", "Diethylpropion", "Phenmetrazine",
        "Pemoline", "Ethylamphetamine",
        # Phenethylamines
        "Ephedrine", "Pseudoephedrine", "Phenylephrine", "Norfenfluramine",
        "Fenfluramine", "Dextrofenfluramine",
        # Cocaine & analogues
        "Cocaine", "Benzoylecgonine", "Ecgonine", "Norcocaine",
        "Cocaethylene", "Methylecgonine",
        # Methylxanthines
        "Caffeine", "Theobromine", "Theophylline", "Paraxanthine",
        # Prescription stimulants
        "Methylphenidate", "Dextromethylphenidate", "Modafinil", "Armodafinil",
        "Lisdexamfetamine", "Atomoxetine", "Pemoline",
        # Entactogens (placed here; also in entactogens)
        "MDMA", "MDA",
        # Miscellaneous
        "Nicotine", "Norcotine", "Cotinine", "Khat",
        "Methiopropamine", "Isopropylphenidate",
    ],

    "depressants_alcohol_gaba": [
        # Alcohols
        "Ethanol", "Methanol", "Isopropanol", "Butanol", "Chloroform",
        # Benzodiazepines
        "Diazepam", "Alprazolam", "Clonazepam", "Lorazepam", "Oxazepam",
        "Temazepam", "Nitrazepam", "Flunitrazepam", "Flurazepam", "Triazolam",
        "Midazolam", "Clobazam", "Chlordiazepoxide", "Bromazepam",
        "Prazepam", "Clorazepate", "Estazolam", "Quazepam", "Halazepam",
        "Brotizolam", "Etizolam", "Clonazolam",
        # Non-benzodiazepine hypnotics (Z-drugs)
        "Zolpidem", "Zopiclone", "Eszopiclone", "Zaleplon", "Indiplon",
        # Barbiturates
        "Phenobarbital", "Secobarbital", "Pentobarbital", "Amobarbital",
        "Butabarbital", "Hexobarbital", "Methohexital", "Thiopental",
        "Primidone", "Metharbital",
        # Carbamates / others
        "Meprobamate", "Carisoprodol",
        # GHB / analogues
        "Gamma-hydroxybutyric acid", "Gamma-butyrolactone", "1,4-Butanediol",
        # Neurosteroid anaesthetics
        "Allopregnanolone", "Propofol", "Etomidate",
        # Miscellaneous sedatives
        "Chloral hydrate", "Paraldehyde", "Hydroxyzine",
    ],

    "opioids": [
        # Natural opiates
        "Morphine", "Codeine", "Thebaine", "Papaverine", "Noscapine",
        "Narcotine", "Neopine",
        # Semi-synthetic opioids
        "Heroin", "Hydromorphone", "Oxymorphone", "Oxycodone", "Hydrocodone",
        "Buprenorphine", "Nalbuphine", "Naloxone", "Naltrexone",
        "Dihydrocodeine", "Dihydromorphine", "Ethylmorphine", "Desomorphine",
        "Diprenorphine", "Samidorphan",
        # Synthetic opioids
        "Fentanyl", "Sufentanil", "Alfentanil", "Remifentanil", "Carfentanil",
        "Methadone", "Levomethadone", "LAAM", "Propoxyphene",
        "Meperidine", "Tramadol", "Tapentadol", "Nefopam",
        "Pethidine", "Ketobemidone", "Piritramide", "Tilidine",
        "Dextropropoxyphene", "Dextrorphan", "Dextromethorphan",
        "Loperamide", "Diphenoxylate",
        "Meptazinol", "Pentazocine", "Butorphanol", "Dezocine",
        # Opioid peptides
        "Enkephalin", "Endorphin", "Dynorphin", "Dermorphin",
        "Endomorphin", "Nociceptin",
        # Novel synthetic opioids
        "Nitazene", "Isotonitazene", "Protonitazene", "Metonitazene",
        "AH-7921", "MT-45", "W-18", "U-47700",
    ],

    "psychedelics_classic": [
        # Lysergamides
        "Lysergic acid diethylamide", "Lysergic acid",
        "Ergine", "Ergotamine", "Ergometrine",
        "1P-LSD", "ALD-52", "AL-LAD", "ETH-LAD", "PRO-LAD",
        # Tryptamines
        "N,N-Dimethyltryptamine", "5-Methoxy-N,N-dimethyltryptamine",
        "Psilocybin", "Psilocin", "Baeocystin", "Norbaeocystin",
        "Bufotenin", "5-Hydroxy-N,N-dimethyltryptamine",
        "4-Acetoxy-DMT", "4-HO-MET", "4-HO-MiPT", "4-HO-DET",
        "4-HO-DPT", "4-HO-DiPT", "5-MeO-MiPT", "5-MeO-DMT",
        "5-MeO-DiPT", "5-MeO-DET", "N,N-dipropyltryptamine",
        "Diethyltryptamine", "Dipropyltryptamine", "Ethyltryptamine",
        "Alpha-methyltryptamine", "Tryptamine",
        # Phenethylamines
        "Mescaline", "2C-B", "2C-I", "2C-E", "2C-C", "2C-D", "2C-T-2",
        "2C-T-7", "2C-P", "2C-G", "2C-N", "2C-T-4",
        "DOB", "DOC", "DOI", "DOM", "DOET", "DOPR",
        "TMA-2", "TMA-6", "3,4,5-Trimethoxyphenethylamine",
        # Iboga alkaloids
        "Ibogaine", "Noribogaine", "Ibogamine", "Tabernanthine",
        # beta-Carbolines
        "Harmine", "Harmaline", "Tetrahydroharmine", "Harman",
        "Norharman", "Tetrahydrobeta-carboline",
        # Salvia
        "Salvinorin A", "Salvinorin B", "Divinorin",
    ],

    "psychedelics_nbome_rc": [
        # NBOMe series
        "25I-NBOMe", "25C-NBOMe", "25B-NBOMe", "25D-NBOMe", "25N-NBOMe",
        "25E-NBOMe", "25H-NBOMe", "25P-NBOMe", "25T-NBOMe",
        # Bromo-DragonFLY and DOx analogues
        "Bromo-DragonFLY",
        # Other research tryptamines
        "5-MeO-AMT", "4-HO-MET", "4-AcO-DMT", "4-AcO-MET",
        "4-AcO-DET", "4-AcO-DiPT", "4-AcO-MiPT",
        # Novel LSD analogues
        "1cP-LSD", "1B-LSD", "1V-LSD",
    ],

    "dissociatives": [
        "Ketamine", "Esketamine", "Arketamine",
        "Phencyclidine", "Methoxetamine", "Dextrorphan", "Dextromethorphan",
        "Memantine", "Amantadine", "Riluzole",
        "Nitrous oxide", "Xenon",
        "Tiletamine", "Diphenidine", "Ephenidine", "Fluorexetamine",
        "Deschloroketamine", "2-Fluorodeschloroketamine", "Methoxphenidine",
        "3-MeO-PCP", "4-MeO-PCP", "3-MeO-PCE", "3-MeO-PCMo",
    ],

    "entactogens": [
        "MDMA", "MDA", "MDEA", "MBDB", "Methylone",
        "Butylone", "Ethylone", "Eutylone", "Pentylone",
        "5-APB", "6-APB", "5-MAPB", "6-MAPB",
        "AMT", "5-IT",
    ],

    "cannabinoids": [
        # Phytocannabinoids
        "Tetrahydrocannabinol", "Cannabidiol", "Cannabinol",
        "Cannabigerol", "Cannabichromene", "Cannabidivarin",
        "Tetrahydrocannabivarin", "Cannabigerovarin",
        "Cannabicyclol", "Cannabielsoin", "Cannabichromanone",
        "Delta-8-tetrahydrocannabinol", "Delta-9-tetrahydrocannabinol",
        # Synthetic cannabinoids
        "JWH-018", "JWH-073", "JWH-133", "JWH-250",
        "AM-2201", "AM-694", "AM-2233",
        "WIN 55,212-2", "CP 55940", "HU-210",
        "Nabilone", "Dronabinol",
        "5F-MDMB-2201", "MDMB-FUBINACA", "AB-FUBINACA", "AB-PINACA",
        # Endocannabinoids (already in neurotransmitters, but adding full names)
        "Anandamide", "2-Arachidonoylglycerol", "Noladin ether",
        "Virodhamine", "N-arachidonoyldopamine",
    ],

    "antidepressants_ssri_snri": [
        # SSRIs
        "Fluoxetine", "Sertraline", "Paroxetine", "Citalopram",
        "Escitalopram", "Fluvoxamine",
        # SNRIs
        "Venlafaxine", "Desvenlafaxine", "Duloxetine", "Milnacipran",
        "Levomilnacipran", "Sibutramine",
        # TCAs
        "Imipramine", "Clomipramine", "Amitriptyline", "Nortriptyline",
        "Desipramine", "Trimipramine", "Protriptyline", "Amoxapine",
        "Doxepin", "Maprotiline", "Lofepramine",
        # MAOIs
        "Phenelzine", "Tranylcypromine", "Isocarboxazid",
        "Selegiline", "Rasagiline", "Moclobemide", "Toloxatone",
        "Brofaromine", "Clorgyline",
        # Atypicals
        "Bupropion", "Mirtazapine", "Trazodone", "Nefazodone",
        "Vilazodone", "Vortioxetine", "Agomelatine", "Tianeptine",
        "Reboxetine", "Atomoxetine",
    ],

    "antipsychotics": [
        # First generation (typicals)
        "Chlorpromazine", "Haloperidol", "Thioridazine", "Trifluoperazine",
        "Fluphenazine", "Perphenazine", "Pimozide", "Droperidol",
        "Bromperidol", "Thiothixene", "Zuclopenthixol", "Flupenthixol",
        "Prochlorperazine", "Levomepromazine",
        # Second generation (atypicals)
        "Clozapine", "Olanzapine", "Risperidone", "Quetiapine",
        "Ziprasidone", "Aripiprazole", "Paliperidone", "Amisulpride",
        "Asenapine", "Iloperidone", "Lurasidone", "Brexpiprazole",
        "Cariprazine", "Pimavanserin",
    ],

    "deliriants_anticholinergics": [
        "Atropine", "Scopolamine", "Hyoscyamine", "Ipratropium",
        "Benztropine", "Biperiden", "Trihexyphenidyl",
        "Diphenhydramine", "Doxylamine", "Chlorphenamine",
        "Datura stramonium",
    ],

    "natural_alkaloids": [
        # Opium poppy
        "Morphine", "Codeine", "Papaverine", "Thebaine", "Noscapine",
        # Coca
        "Cocaine", "Ecgonine",
        # Coffee / tea
        "Caffeine", "Theobromine", "Theophylline",
        # Tobacco
        "Nicotine", "Anabasine", "Nornicotine",
        # Ergot
        "Ergotamine", "Ergometrine", "Ergine", "Lysergic acid",
        # Ayahuasca
        "Harmine", "Harmaline", "Tetrahydroharmine", "N,N-Dimethyltryptamine",
        # Yopo / cohoba
        "Bufotenin", "5-Methoxy-N,N-dimethyltryptamine",
        # Ibogaine
        "Ibogaine", "Noribogaine",
        # Peyote / cacti
        "Mescaline", "Anhalonidine", "Anhalonine",
        # Khat
        "Cathinone", "Cathine",
        # Betel / areca
        "Arecoline", "Arecaidine", "Guvacoline",
        # Colchicine (mitosis)
        "Colchicine",
        # Strychnine / brucine
        "Strychnine", "Brucine",
        # Psilocybe
        "Psilocybin", "Psilocin", "Baeocystin",
        # Muscimol
        "Muscimol", "Ibotenic acid", "Muscarine",
        # Mitragyna
        "Mitragynine", "7-Hydroxymitragynine", "Speciociliatine",
        # Pilocarpus
        "Pilocarpine", "Pilocarpidine",
        # Rauwolfia / vinca
        "Reserpine", "Yohimbine", "Vinblastine", "Vincristine",
        # Henbane / belladonna
        "Hyoscyamine", "Scopolamine", "Atropine",
        # Valerian
        "Valerenic acid", "Isovaleric acid",
        # Kratom
        "Mitragynine",
        # Ephedra
        "Ephedrine", "Pseudoephedrine",
        # Tabernanthe iboga
        "Ibogaine", "Voacangine", "Tabernanthine",
        # Acacia / mimosa
        "N,N-Dimethyltryptamine",
        # Miscellaneous
        "Quinine", "Physostigmine", "Pilocarpine",
    ],

    "nootropics_cognitive": [
        "Piracetam", "Aniracetam", "Oxiracetam", "Pramiracetam",
        "Phenylpiracetam", "Coluracetam", "Nefiracetam", "Levetiracetam",
        "Modafinil", "Armodafinil", "Adrafinil",
        "Baclofen", "Phenibut", "Picamilon",
        "Alpha-GPC", "Citicoline",
        "Huperzine A",
        "Galantamine", "Rivastigmine", "Donepezil",
        "Noopept", "Semax", "Selank",
        "Vinpocetine", "Idebenone",
        "Nicergoline", "Hydergine",
    ],

    "anesthetics_analgesics": [
        # Local anesthetics
        "Lidocaine", "Bupivacaine", "Ropivacaine", "Mepivacaine",
        "Articaine", "Prilocaine", "Benzocaine", "Procaine", "Tetracaine",
        "Chloroprocaine", "Proparacaine",
        # General anesthetics
        "Halothane", "Isoflurane", "Sevoflurane", "Desflurane",
        "Enflurane", "Methoxyflurane", "Nitrous oxide",
        "Propofol", "Etomidate", "Thiopental", "Methohexital",
        "Ketamine",
        # NSAIDs
        "Aspirin", "Ibuprofen", "Naproxen", "Diclofenac", "Celecoxib",
        "Indomethacin", "Piroxicam", "Meloxicam", "Ketorolac",
        # Paracetamol
        "Paracetamol",
    ],

    "hormones_related_drugs": [
        # Androgens / AAS
        "Nandrolone", "Stanozolol", "Oxandrolone", "Metandienone",
        "Boldenone", "Trenbolone", "Mesterolone", "Fluoxymesterone",
        "Methyltestosterone", "Oxymetholone",
        # SERMs / estrogen antagonists
        "Tamoxifen", "Clomifene", "Raloxifene", "Toremifene",
        "Fulvestrant", "Anastrozole", "Letrozole", "Exemestane",
        # Glucocorticoids
        "Prednisone", "Prednisolone", "Methylprednisolone", "Hydrocortisone",
        "Dexamethasone", "Triamcinolone", "Budesonide", "Fluticasone",
        "Beclometasone", "Mometasone",
        # Thyroid hormones
        "Levothyroxine", "Liothyronine",
        # PDE5 inhibitors
        "Sildenafil", "Tadalafil", "Vardenafil",
    ],

    "psychedelic_research": [
        # Piperazines
        "Benzylpiperazine", "Trifluoromethylphenylpiperazine",
        "Chlorophenylpiperazine", "Meta-chlorophenylpiperazine",
        # Empathogens / research
        "MDAI", "5-MAPB", "6-APB",
        # MDMA analogues
        "Methylone", "Butylone", "Ethylone", "Eutylone",
        # Phenylalanine derivatives
        "Phenylalanine", "Tyrosine", "Tryptophan",
        # Precursors
        "Safrole", "Isosafrole", "Piperonal", "PMK", "BMK",
        # Phenidates
        "Methylphenidate", "Ethylphenidate", "Isopropylphenidate",
        # Indole psychedelics
        "4-AcO-DMT", "4-AcO-MET", "4-AcO-MiPT",
        "4-HO-DET", "4-HO-DPT",
        # Amanita alkaloids
        "Muscimol", "Ibotenic acid", "Muscarine", "Muscazone",
        # Tropane alkaloids
        "Tropine", "Nortropine", "Ecgonine",
        # Phenethylamine psychedelics
        "2C-T-2", "2C-T-7", "2C-G-3", "2C-G-5",
        # Aminoindanes
        "MDAI", "5-IAI", "NM-2-AI",
    ],

}

# ── Wikimedia Commons categories to crawl ────────────────────────────────────

COMMONS_CATEGORIES = [
    "Neurotransmitter skeletal formulas",
    "Neurochemistry",
    "Hormones",
    "Steroid hormones",
    "Psychedelic drugs",
    "Entactogens and empathogens",
    "Dissociative drugs",
    "Cannabinoids",
    "Opioids",
    "Stimulants",
    "Antidepressants",
    "Antipsychotics",
    "Entheogens",
    "Ibogaine alkaloids",
    "Lysergamides",
    "Tryptamines",
    "Phenethylamines",
    "Beta-carbolines",
    "Salvia divinorum",
    "Alkaloids",
    "Amino acids",
    "Anaesthetics",
    "Local anaesthetics",
    "Barbiturates",
    "Benzodiazepines",
]

# ── Scoring / image selection ─────────────────────────────────────────────────

STRUCTURE_KW = {"structure", "skeletal", "formula", "2d", "molecule", "bond", "chemical"}
EXCLUDE_KW   = {"logo", "flag", "icon", "map", "photo", "portrait", "seal",
                "coat_of_arms", "ribbon", "pill", "tablet", "capsule"}


def score_image(filename: str) -> int:
    low = filename.lower()
    if any(ex in low for ex in EXCLUDE_KW):
        return 0
    is_svg = low.endswith(".svg")
    is_png = low.endswith(".png")
    if not (is_svg or is_png):
        return 0
    has_kw = any(kw in low for kw in STRUCTURE_KW)
    if not has_kw and not is_svg:
        return 0
    return (2 if is_svg else 1) + (3 if has_kw else 0)


def best_image(images: list[dict]) -> str | None:
    scored = [(score_image(i["title"].removeprefix("File:")), i["title"].removeprefix("File:"))
              for i in images]
    scored = [(s, f) for s, f in scored if s > 0]
    if not scored:
        return None
    return max(scored)[1]

# ── Wikipedia / Commons API helpers ──────────────────────────────────────────

def wp_get(params: dict) -> dict:
    params.setdefault("format", "json")
    r = requests.get(WIKIPEDIA_API, params=params, headers=HEADERS, timeout=15)
    r.raise_for_status()
    return r.json()


def commons_get(params: dict) -> dict:
    params.setdefault("format", "json")
    r = requests.get(COMMONS_API, params=params, headers=HEADERS, timeout=15)
    r.raise_for_status()
    return r.json()


def page_images(title: str) -> list[dict]:
    data = wp_get({"action": "query", "titles": title, "prop": "images", "imlimit": 100})
    for page in data.get("query", {}).get("pages", {}).values():
        if "missing" not in page:
            return page.get("images", [])
    return []


def file_url_wikipedia(filename: str) -> str | None:
    data = wp_get({"action": "query", "titles": f"File:{filename}",
                   "prop": "imageinfo", "iiprop": "url|mime"})
    for page in data.get("query", {}).get("pages", {}).values():
        for info in page.get("imageinfo", []):
            return info.get("url")
    return None


def file_url_commons(filename: str) -> str | None:
    data = commons_get({"action": "query", "titles": f"File:{filename}",
                        "prop": "imageinfo", "iiprop": "url"})
    for page in data.get("query", {}).get("pages", {}).values():
        for info in page.get("imageinfo", []):
            return info.get("url")
    return None


def commons_category_files(category: str, limit: int = 500) -> list[str]:
    filenames: list[str] = []
    params = {"action": "query", "list": "categorymembers",
              "cmtitle": f"Category:{category}", "cmtype": "file",
              "cmlimit": min(limit, 500)}
    while True:
        data = commons_get(params)
        for m in data.get("query", {}).get("categorymembers", []):
            fn = m["title"].removeprefix("File:")
            if score_image(fn) > 0:
                filenames.append(fn)
        cont = data.get("continue", {}).get("cmcontinue")
        if not cont or len(filenames) >= limit:
            break
        params["cmcontinue"] = cont
    return filenames[:limit]

# ── Download with retry / rate-limit handling ─────────────────────────────────

def download_url(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    http_errors = 0
    rate_hits = 0
    while True:
        r = requests.get(url, headers=HEADERS, timeout=60, stream=True)
        if r.status_code == 429:
            rate_hits += 1
            wait = float(r.headers.get("Retry-After", min(30 * rate_hits, 300)))
            print(f"    rate-limited (#{rate_hits}) — sleeping {wait:.0f}s …", flush=True)
            time.sleep(wait)
            continue
        if r.status_code == 404:
            raise requests.HTTPError(f"404 Not Found", response=r)
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(8192):
                f.write(chunk)
        return


def safe_name(s: str) -> str:
    return s.replace(" ", "_").replace("/", "-").replace(":", "-").replace(",", "")

# ── Per-chemical download (Wikipedia source) ──────────────────────────────────

def download_chemical(name: str, out_dir: Path, delay: float) -> bool:
    """
    1. Look up the Wikipedia page for `name`.
    2. Find the best structure image (prefer SVG).
    3. Download it to out_dir/<safe_name>.[svg|png].
    """
    stem = safe_name(name)
    # Skip if already downloaded
    for ext in (".svg", ".png"):
        if (out_dir / f"{stem}{ext}").exists():
            print(f"  [skip] {name} — already downloaded")
            return True

    print(f"  Querying Wikipedia: '{name}' …", end=" ", flush=True)
    try:
        images = page_images(name)
    except Exception as e:
        print(f"API error: {e}")
        return False

    if not images:
        print("no page images.")
        return False

    best = best_image(images)
    if not best:
        print("no structure image.")
        return False

    is_svg = best.lower().endswith(".svg")
    ext = ".svg" if is_svg else ".png"
    dest = out_dir / f"{stem}{ext}"
    print(f"→ '{best[:60]}' ", end="", flush=True)

    url = file_url_wikipedia(best)
    if not url:
        print("no URL.")
        return False

    try:
        download_url(url, dest)
        print(f"✓ {dest.name}")
        time.sleep(delay)
        return True
    except requests.HTTPError as e:
        print(f"HTTP error: {e}")
        return False
    except Exception as e:
        print(f"error: {e}")
        return False


def download_commons_file(filename: str, out_dir: Path, delay: float) -> bool:
    stem = safe_name(Path(filename).stem)
    is_svg = filename.lower().endswith(".svg")
    ext = ".svg" if is_svg else ".png"
    dest = out_dir / f"{stem}{ext}"
    if dest.exists():
        return True

    url = file_url_commons(filename)
    if not url:
        url = file_url_wikipedia(filename)
    if not url:
        print(f"  no URL for {filename}")
        return False
    try:
        download_url(url, dest)
        print(f"  {filename[:60]} → {dest.name}")
        time.sleep(delay)
        return True
    except Exception as e:
        print(f"  {filename}: {e}")
        return False

# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    all_categories = list(CHEMICALS.keys())
    total_named = sum(len(v) for v in CHEMICALS.values())

    parser = argparse.ArgumentParser(
        description=(
            f"Download SVG chemical structures of neurotransmitters, hormones,"
            f" and psychoactives from Wikipedia / Wikimedia Commons.\n"
            f"Curated list: {total_named} chemicals in {len(all_categories)} categories."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--category", "-c", choices=all_categories + ["all"], default="all",
        metavar="CAT",
        help=f"Chemical category to download (default: all). Choices: {', '.join(all_categories)}",
    )
    parser.add_argument(
        "--commons", action="store_true",
        help="Also crawl Wikimedia Commons categories for additional SVGs",
    )
    parser.add_argument(
        "--commons-limit", type=int, default=200, metavar="N",
        help="Max files to pull from each Commons category (default: 200)",
    )
    parser.add_argument(
        "--output", "-o", default="neuro_structures",
        help="Root output directory (default: neuro_structures/)",
    )
    parser.add_argument(
        "--delay", type=float, default=0.6,
        help="Seconds between downloads (default: 0.6)",
    )
    parser.add_argument(
        "--list", action="store_true",
        help="Print all chemical names and exit",
    )
    parser.add_argument(
        "--list-categories", action="store_true",
        help="Print category names and counts, then exit",
    )

    args = parser.parse_args()

    if args.list_categories:
        for cat, items in CHEMICALS.items():
            print(f"  {cat:35s}  {len(items):3d} chemicals")
        print(f"\n  Total: {total_named} chemicals in {len(all_categories)} categories")
        return

    if args.list:
        cats = all_categories if args.category == "all" else [args.category]
        for cat in cats:
            print(f"\n# {cat}")
            for name in CHEMICALS[cat]:
                print(f"  {name}")
        return

    root = Path(args.output)
    root.mkdir(exist_ok=True)

    # ── 1. Named chemicals via Wikipedia ──────────────────────────────────────
    cats_to_run = all_categories if args.category == "all" else [args.category]

    grand_ok = grand_fail = 0
    for cat in cats_to_run:
        chemicals = CHEMICALS[cat]
        out_dir = root / cat
        out_dir.mkdir(exist_ok=True)
        print(f"\n{'─'*60}")
        print(f"Category: {cat}  ({len(chemicals)} chemicals → {out_dir}/)")
        print(f"{'─'*60}")
        ok = fail = 0
        for i, name in enumerate(chemicals, 1):
            print(f"[{i:3d}/{len(chemicals)}] {name}")
            success = download_chemical(name, out_dir, args.delay)
            if success:
                ok += 1
            else:
                fail += 1
        print(f"  → {ok} ok, {fail} failed")
        grand_ok += ok
        grand_fail += fail

    # ── 2. Wikimedia Commons categories ───────────────────────────────────────
    if args.commons:
        commons_dir = root / "_commons"
        commons_dir.mkdir(exist_ok=True)
        print(f"\n{'─'*60}")
        print(f"Commons category crawl ({len(COMMONS_CATEGORIES)} categories)")
        print(f"{'─'*60}")
        for cat in COMMONS_CATEGORIES:
            sub_dir = commons_dir / safe_name(cat)
            sub_dir.mkdir(exist_ok=True)
            print(f"\n  Category: {cat}")
            try:
                files = commons_category_files(cat, args.commons_limit)
            except Exception as e:
                print(f"  error listing category: {e}")
                continue
            print(f"  {len(files)} files found")
            ok = fail = 0
            for fn in files:
                if download_commons_file(fn, sub_dir, args.delay):
                    ok += 1
                else:
                    fail += 1
            print(f"  → {ok} ok, {fail} failed")
            grand_ok += ok
            grand_fail += fail

    print(f"\n{'═'*60}")
    print(f"TOTAL: {grand_ok} downloaded, {grand_fail} failed/skipped")
    svgs = list(root.rglob("*.svg"))
    pngs = list(root.rglob("*.png"))
    print(f"Files on disk: {len(svgs)} SVGs  +  {len(pngs)} PNGs = {len(svgs)+len(pngs)} total")


if __name__ == "__main__":
    main()
