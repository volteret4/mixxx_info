#!/usr/bin/env python3
"""
Rellena la tabla `recommendations` (ver src/db.py::Recommendation) con
listas curadas a mano por cajón, calibradas contra lo que ya hay en la
colección real (sellos-discograficos/musica_local.sqlite + los archivos
reales en /mnt/windows/Mix/techno y /mnt/windows/Mix/6_house) para no
repetir artistas que ya se tienen.

Upsert por (crate, artist) -- correrlo varias veces no duplica filas,
solo actualiza referencia/nota/orden si han cambiado.

Uso:
    python seed_recommendations.py
"""
from src.db import Recommendation, get_engine, init_db
from sqlalchemy.orm import Session

DB_URL = "sqlite:///library.db"

# (crate, crate_label, [(artist, reference, note), ...])
RECOMMENDATIONS = [
    ("techno", "Techno", [
        ("Robert Hood", "Minimal Nation", "El documento fundacional del minimal techno de Detroit -- hueco sorprendente dado lo que ya tienes de Jeff Mills/Underground Resistance"),
        ("Surgeon", "Breaking the Frame", "Birmingham, crudo y físico -- el lado más duro que ya apuntan Charlotte de Witte/I Hate Models"),
        ("Regis / Sandwell District", "Catálogo Sandwell District", "Dub-techno británico, mismo territorio que Basic Channel/DeepChord"),
        ("Rrose", "Hymn to Moisture", "Hipnótico y moderno, al lado de Kangding Ray/Call Super"),
        ("Peter Van Hoesen", "Entropic City", "Time To Express -- profundo y texturizado, misma liga que Donato Dozzy"),
        ("Oscar Mulero", "Woven Ways", "Institución del techno español, si todavía no lo conoces"),
        ("Convextion", "Discografía (Rephlex/Clone)", "Dub techno Drexciya-adjacent, muy en línea con DeepChord"),
        ("Shed", "The Traveller", "Berlín, techno jugueton pero profundo"),
    ]),
    ("techno_acid", "Techno — Acid", [
        ("Phuture", "Acid Tracks", "El track original que inventó el acid -- Chicago, 1987"),
        ("Hardfloor", "Acperience", "Himno del acid techno de los 90, 303 puro"),
        ("Tin Man", "Discografía", "Acid techno moderno, minimalista"),
        ("DJ Stingray", "Discografía (Micron Audio)", "Acid-electro-techno de Detroit, heredero de Drexciya"),
        ("Function", "Discografía", "Acid techno con matices industriales"),
    ]),
    ("techno_deep", "Techno — Deep", [
        ("Max Cooper", "Discografía", "Techno melódico-profundo, producción muy cuidada"),
        ("Rødhåd", "Discografía (Dystopian)", "Berlín, atmosférico y oscuro"),
        ("Stephan Bodzin", "Discografía", "Melódico-profundo, en la línea de Vince Watson"),
        ("Alexkid", "Discografía", "Deep techno/house con groove orgánico"),
    ]),
    ("techno_dub", "Techno — Dub", [
        ("Porter Ricks", "Biokinetics", "El clásico absoluto del dub techno -- si solo compras uno, que sea este"),
        ("Fluxion", "Discografía", "Dub techno de Malta, denso y atmosférico"),
        ("Yagya", "Discografía", "Dub techno islandés, muy minimalista"),
        ("Monolake", "Hong Kong", "Robert Henke -- dub techno de referencia"),
        ("Vainqueur", "Lyot EP", "Basic Channel-adjacent, esencial"),
    ]),
    ("techno_groove", "Techno — Groove (peak time)", [
        ("Chris Liebing", "Discografía", "Peak-time alemán, mismo nivel que Adam Beyer/Umek"),
        ("Pan-Pot", "Discografía", "Groove techno pulido, Berlín"),
        ("ANNA", "Discografía (Octopus)", "Groove techno enérgico"),
        ("Reinier Zonneveld", "Discografía", "Groove techno orgánico, muy en directo"),
        ("Dense & Pika", "Discografía", "Groove techno con tintes melódicos"),
    ]),
    ("techno_melodic", "Techno — Melodic (Afterlife-style)", [
        ("Tale Of Us", "Discografía (Afterlife)", "Referencia del melodic techno actual -- raro que no esté ya"),
        ("Mind Against", "Discografía", "Melodic techno atmosférico, mismo sello que Adam Port"),
        ("Innellea", "Discografía", "Melodic techno emotivo, muy popular en Afterlife"),
        ("Massano", "Discografía", "Melodic techno más oscuro, buen contraste"),
    ]),
    ("techno_minimal", "Techno — Minimal", [
        ("Ricardo Villalobos", "Alcachofa", "El icono absoluto del minimal -- hueco notable"),
        ("Robag Wruhme", "Wuzzelbud \"KK\"", "Minimal alemán, cálido y extraño"),
        ("Losoul", "Belong", "Minimal house/techno, Playhouse Records"),
        ("Mathew Jonson", "Discografía", "Minimal techno orgánico, muy musical"),
    ]),
    ("techno_trance", "Techno — Trance", [
        ("Jam & Spoon", "Stella", "Clásico absoluto del trance europeo"),
        ("Age Of Love", "The Age Of Love", "Himno fundacional del trance, 1990"),
        ("Cosmic Baby", "Discografía", "Trance alemán de los 90, mismo espíritu que Rank 1"),
        ("Sven Väth", "Discografía temprana", "Puente entre trance y techno, muy en línea con SCSI-9"),
    ]),
    ("house", "House", [
        ("Theo Parrish", "First Floor", "Deep house de Detroit -- el hueco más grande de este cajón"),
        ("Moodymann", "Silentintroduction", "KDJ, mismo linaje Detroit que Theo Parrish"),
        ("DJ Sprinkles (Terre Thaemlitz)", "Midtown 120 Blues", "Deep house político y denso -- registro muy distinto a lo que ya tienes"),
        ("Ron Trent", "Catálogo Prescription", "Deep house de Chicago, era Prescription"),
        ("Pépé Bradock", "Unresolved Violence", "House francés excéntrico y esencial"),
        ("DJ Koze", "Knock Knock", "Melódico y raro, encaja con tus discos de Lawrence/Leon Vynehall"),
        ("Carl Craig", "69 (The Sound of Music)", "Detroit, difumina techno/house"),
        ("Session Victim", "Discografía", "Deep house moderno y cálido, en línea con Christopher Rau"),
    ]),
    ("house_dream", "House — Dream / Italo", [
        ("Metro Area", "Metro Area", "NYC, house/disco onírico, mismo espíritu que la compilación italiana que ya tienes"),
        ("Mood II Swing", "Discografía", "House soñador de los 90, muy musical"),
        ("Hardway Bros", "Discografía", "Deep/dreamy house británico"),
    ]),
    ("house_funk", "House — Funk / Soulful", [
        ("Dennis Ferrer", "Discografía", "Soulful house de NYC, muy en línea con 6th Borough Project"),
        ("Crazy P", "Discografía", "Funk-house con banda real detrás"),
        ("Motor City Drum Ensemble", "Discografía", "Funky/soulful house con raíces disco"),
        ("Chez Damier", "Discografía (Prescription)", "Soulful house de Detroit/Chicago, esencial"),
    ]),
    ("house_gospel", "House — Gospel", [
        ("Joe Smooth", "Promised Land", "El himno del gospel house de Chicago"),
        ("Ce Ce Rogers", "Someday", "Clásico absoluto del gospel/soulful house"),
        ("Robert Owens", "Discografía", "Voz icónica del house de Chicago, muchos cortes gospel"),
        ("Sylvester", "Discografía", "Raíces disco-gospel que alimentan todo el género"),
    ]),
    ("house_trance", "House — Trance", [
        ("Humate", "Love Stimulation", "Trance-house de los 90, mismo espíritu que Angelmoon"),
        ("BBE", "Seven Days and One Week", "Himno trance-house europeo"),
        ("Cosmic Gate", "Discografía temprana", "Euro trance-house, muy bailable"),
    ]),
    ("house_deep", "House — Deep", [
        ("Omar-S", "Discografía (FXHE)", "Deep house crudo de Detroit"),
        ("Rhythm & Sound", "Discografía", "Cruce dub/house de Basic Channel, mismo universo que tu cajón de dub techno"),
        ("Floorplan", "Discografía", "El alias house de Robert Hood -- deep house con raíz gospel"),
    ]),
    ("idm", "IDM", [
        ("Autechre", "Incunabula / Tri Repetae / Confield", "La otra mitad de tu estantería de Aphex/Plaid/Squarepusher -- hueco muy llamativo"),
        ("Luke Vibert", "Wagon Christ / Kerrier District", "IDM-acid juguetón, Rephlex-adjacent"),
        ("Clark", "Body Riddle / Turning Dragon", "IDM melódico-agresivo, Warp"),
        ("Venetian Snares", "Rossz Csillag Alatt Született", "Breakcore-clásico, el extremo más caótico del género"),
        ("Jega", "Discografía (Rephlex)", "Clásico Rephlex, encaja junto a Black Dog/Plaid"),
        ("Nathan Fake", "Drowning in a Sea of Love", "IDM melódico-emocional, buen contraste con ISAN/Ulrich Schnauss"),
        ("Bogdan Raczynski", "Discografía", "Caótico y manic, contraste con lo más ambient que ya tienes"),
    ]),
]


def main():
    engine = get_engine(DB_URL)
    init_db(engine)

    inserted, updated = 0, 0
    with Session(engine) as session:
        for crate, crate_label, items in RECOMMENDATIONS:
            for position, (artist, reference, note) in enumerate(items):
                row = (
                    session.query(Recommendation)
                    .filter_by(crate=crate, artist=artist)
                    .first()
                )
                if row:
                    row.crate_label = crate_label
                    row.reference = reference
                    row.note = note
                    row.position = position
                    updated += 1
                else:
                    session.add(Recommendation(
                        crate=crate, crate_label=crate_label, artist=artist,
                        reference=reference, note=note, position=position,
                    ))
                    inserted += 1
        session.commit()

    print(f"✅ {inserted} insertadas, {updated} actualizadas "
          f"({len(RECOMMENDATIONS)} cajones)")


if __name__ == "__main__":
    main()
