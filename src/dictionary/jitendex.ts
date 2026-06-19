import { DictionaryEntry, DictionarySense, StructuredContent, StructuredContentNode, YomitanTerm } from "./types";

function findNodes(content: StructuredContent | undefined, dataContent: string): StructuredContentNode[] {
  if (content === undefined || typeof content === "string") return [];
  if (Array.isArray(content)) return content.flatMap((item) => findNodes(item, dataContent));

  const matches = content.data?.content === dataContent ? [content] : [];
  return matches.concat(findNodes(content.content, dataContent));
}

function toText(content: StructuredContent | undefined): string {
  if (content === undefined) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(toText).join("");
  if (content.tag === "rt") return "";
  return toText(content.content);
}

function parseSense(group: StructuredContentNode): DictionarySense[] {
  const partOfSpeech = findNodes(group.content, "part-of-speech-info").map((node) => toText(node.content));
  const senseNodes = findNodes(group.content, "sense");

  return senseNodes.flatMap((sense) => {
    const glosses = findNodes(sense.content, "glossary")
      .flatMap((node) => findNodes(node.content, "glossary-item").map((item) => toText(item.content)))
      .filter(Boolean);

    // Glossary list items do not currently carry a data marker.
    if (glosses.length === 0) {
      for (const glossary of findNodes(sense.content, "glossary")) {
        const items = collectTags(glossary.content, "li").map((item) => toText(item.content));
        glosses.push(...items.filter(Boolean));
      }
    }

    if (glosses.length === 0) {
      glosses.push(
        ...findNodes(sense.content, "info-gloss-content")
          .map((node) => toText(node.content))
          .filter(Boolean),
      );
    }

    const exampleNode = findNodes(sense.content, "example-sentence").at(0);
    const japanese = findNodes(exampleNode?.content, "example-sentence-a").map((node) => toText(node.content))[0];
    const english = findNodes(exampleNode?.content, "example-sentence-b").map((node) => toText(node.content))[0];
    const example = japanese || english ? { japanese: japanese ?? "", english: english ?? "" } : undefined;

    return glosses.length > 0 ? [{ partOfSpeech, glosses, example }] : [];
  });
}

function collectTags(content: StructuredContent | undefined, tag: string): StructuredContentNode[] {
  if (content === undefined || typeof content === "string") return [];
  if (Array.isArray(content)) return content.flatMap((item) => collectTags(item, tag));
  const matches = content.tag === tag ? [content] : [];
  return matches.concat(collectTags(content.content, tag));
}

export function parseTerm(term: YomitanTerm, bankIndex: number, termIndex: number): DictionaryEntry {
  const [expression, reading, , , score, definitions, sequence] = term;
  const senses = definitions.flatMap((definition) => {
    if (typeof definition === "string") {
      return [{ partOfSpeech: [], glosses: [definition] }];
    }
    if (!isStructuredDefinition(definition)) return [];

    const groups = findNodes(definition.content, "sense-group");
    if (groups.length > 0) return groups.flatMap(parseSense);

    const redirect = findNodes(definition.content, "redirect-glossary").at(0);
    const redirectText = toText(redirect?.content).replace(/^⟶/, "").trim();
    return redirectText ? [{ partOfSpeech: [], glosses: [`See ${redirectText}`] }] : [];
  });

  return {
    id: `${sequence}-${bankIndex}-${termIndex}`,
    term: expression,
    reading: reading || expression,
    score,
    senses,
  };
}

function isStructuredDefinition(
  definition: unknown,
): definition is { type: "structured-content"; content: StructuredContent } {
  return (
    typeof definition === "object" &&
    definition !== null &&
    !Array.isArray(definition) &&
    "type" in definition &&
    definition.type === "structured-content" &&
    "content" in definition
  );
}
