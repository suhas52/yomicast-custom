export type DictionaryExample = {
  japanese: string;
  english: string;
};

export type DictionarySense = {
  partOfSpeech: string[];
  glosses: string[];
  example?: DictionaryExample;
};

export type DictionaryEntry = {
  id: string;
  term: string;
  reading: string;
  score: number;
  senses: DictionarySense[];
};

export type StructuredContent = string | StructuredContentNode | StructuredContent[];

export type StructuredContentNode = {
  tag?: string;
  content?: StructuredContent;
  data?: Record<string, unknown>;
};

export type YomitanTerm = [
  term: string,
  reading: string,
  definitionTags: string,
  rules: string,
  score: number,
  definitions: unknown[],
  sequence: number,
  termTags: string,
];
