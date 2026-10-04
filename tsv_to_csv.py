import csv
import gzip
import sys
from pathlib import Path


SCHEMAS = {
    "taxon": {
        "source_headers": [
            "taxonID",
            "scientificName",
            "scientificNameID",
            "taxonRank",
            "taxonomicStatus",
            "kingdom",
            "phylum",
            "class",
            "order",
            "family",
            "genus",
            "vernacularName",
            "nameAccordingTo",
            "taxonRemarks",
            "modified",
            "references",
            "datasetID",
            "taxonConceptID",
        ],
        "target_headers": [
            "taxon_id",
            "scientific_name",
            "scientific_name_id",
            "taxon_rank",
            "taxonomic_status",
            "kingdom",
            "phylum",
            "class_name",
            "order_name",
            "family",
            "genus",
            "vernacular_name",
            "name_according_to",
            "taxon_remarks",
            "source_modified",
            "reference_url",
            "dataset_id",
            "taxon_concept_id",
        ],
    },
    "vernacular": {
        "source_headers": [
            "taxonID",
            "vernacularName",
            "language",
            "countryCode",
            "source",
        ],
        "target_headers": [
            "taxon_id",
            "vernacular_name",
            "language",
            "country_code",
            "source",
        ],
    },
}


def convert(source_path: str, target_path: str, schema_name: str):
    schema = SCHEMAS[schema_name]

    expected_headers = schema["source_headers"]
    target_headers = schema["target_headers"]

    source = Path(source_path)
    target = Path(target_path)

    row_count = 0

    with gzip.open(
        source,
        "rt",
        encoding="utf-8",
        newline="",
    ) as src, open(
        target,
        "w",
        encoding="utf-8",
        newline="",
    ) as dst:

        reader = csv.reader(src, delimiter="\t")
        writer = csv.writer(dst)

        actual_headers = next(reader)

        if actual_headers != expected_headers:
            raise ValueError(
                "Header 不符合预期。\n"
                f"实际: {actual_headers}\n"
                f"预期: {expected_headers}"
            )

        writer.writerow(target_headers)

        expected_columns = len(expected_headers)

        for line_number, row in enumerate(reader, start=2):
            if len(row) != expected_columns:
                raise ValueError(
                    f"第 {line_number} 行列数异常："
                    f"实际 {len(row)}，预期 {expected_columns}"
                )

            writer.writerow(row)
            row_count += 1

    print(f"完成: {target}")
    print(f"数据行数: {row_count:,}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(
            "Usage: python3 tropicals_to_csv.py "
            "<taxon|vernacular> <source.tsv.gz> <target.csv>"
        )
        sys.exit(1)

    convert(
        source_path=sys.argv[2],
        target_path=sys.argv[3],
        schema_name=sys.argv[1],
    )
