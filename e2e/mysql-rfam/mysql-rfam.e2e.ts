import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);

it('should execute', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
    },
  });
  await expect(
    execute({
      query: /* GraphQL */ `
        query TestQuery {
          alignment_and_tree(limit: 5) {
            rfam_acc
            family(limit: 1) {
              type
              description
              comment
              author
            }
          }
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "alignment_and_tree": [
          {
            "family": [
              {
                "author": "Griffiths-Jones SR, Mifsud W, Gardner PP",
                "comment": "5S ribosomal RNA (5S rRNA) is a component of the large ribosomal subunit in both prokaryotes and eukaryotes. In eukaryotes, it is synthesised by RNA polymerase III (the other eukaryotic rRNAs are cleaved from a 45S precursor synthesised by RNA polymerase I). In Xenopus oocytes, it has been shown that fingers 4-7 of the nine-zinc finger transcription factor TFIIIA can bind to the central region of 5S RNA. Thus, in addition to positively regulating 5S rRNA transcription, TFIIIA also stabilises 5S rRNA until it is required for transcription.",
                "description": "5S ribosomal RNA",
                "type": "Gene; rRNA;",
              },
            ],
            "rfam_acc": "RF00001",
          },
          {
            "family": [
              {
                "author": "Griffiths-Jones SR, Mifsud W, Gardner PP",
                "comment": "5S ribosomal RNA (5S rRNA) is a component of the large ribosomal subunit in both prokaryotes and eukaryotes. In eukaryotes, it is synthesised by RNA polymerase III (the other eukaryotic rRNAs are cleaved from a 45S precursor synthesised by RNA polymerase I). In Xenopus oocytes, it has been shown that fingers 4-7 of the nine-zinc finger transcription factor TFIIIA can bind to the central region of 5S RNA. Thus, in addition to positively regulating 5S rRNA transcription, TFIIIA also stabilises 5S rRNA until it is required for transcription.",
                "description": "5S ribosomal RNA",
                "type": "Gene; rRNA;",
              },
            ],
            "rfam_acc": "RF00001",
          },
          {
            "family": [
              {
                "author": "Griffiths-Jones SR, Mifsud W",
                "comment": "5.8S ribosomal RNA (5.8S rRNA) is a component of the large subunit of the eukaryotic ribosome. It is transcribed by RNA polymerase I as part of the 45S precursor that also contains 18S and 28S rRNA. Functionally, it is thought that 5.8S rRNA may be involved in ribosome translocation [2]. It is also known to form covalent linkage to the p53 tumour suppressor protein [3]. 5.8S rRNA is also found in archaea.",
                "description": "5.8S ribosomal RNA",
                "type": "Gene; rRNA;",
              },
            ],
            "rfam_acc": "RF00002",
          },
          {
            "family": [
              {
                "author": "Griffiths-Jones SR, Mifsud W",
                "comment": "5.8S ribosomal RNA (5.8S rRNA) is a component of the large subunit of the eukaryotic ribosome. It is transcribed by RNA polymerase I as part of the 45S precursor that also contains 18S and 28S rRNA. Functionally, it is thought that 5.8S rRNA may be involved in ribosome translocation [2]. It is also known to form covalent linkage to the p53 tumour suppressor protein [3]. 5.8S rRNA is also found in archaea.",
                "description": "5.8S ribosomal RNA",
                "type": "Gene; rRNA;",
              },
            ],
            "rfam_acc": "RF00002",
          },
          {
            "family": [
              {
                "author": "Griffiths-Jones SR, Mifsud W, Moxon SJ, Ontiveros-Palacios N",
                "comment": "U1 is a small nuclear RNA (snRNA) component of the spliceosome (involved in pre-mRNA splicing). Its 5' end forms complementary base pairs with the 5' splice junction, thus defining the 5' donor site of an intron. There are significant differences in sequence and secondary structure between metazoan and yeast U1 snRNAs, the latter being much longer (568 nucleotides as compared to 164 nucleotides in human). Nevertheless, secondary structure predictions suggest that all U1 snRNAs share a 'common core' consisting of helices I, II, the proximal region of III, and IV [1]. This family does not contain the larger yeast sequences. The structure of U1 spliceosomal RNA has been reported in [5,6]. It present 4 Stem loops (SL1, SL2, SL3, and SL4) and a region call Helix H. SL1, SL2, and SL3 are join for the Helix H, forming a four-helix junction that are separated of SL4. U1 snRNA is important in the precatalytic spliceosome, where the 5' splice site (5'SS) of the pre-mRNA is recognized by pairing with 5'-U1 snRNA. Where spliceosome activation is initiated by a disruption of the 5â€²SSâ€“U1 snRNP interaction by the DEAD-box helicase Prp28 [6]. The structure of U1 small nucleolar RNA was reported in PDB:6QX9",
                "description": "U1 spliceosomal RNA",
                "type": "Gene; snRNA; splicing;",
              },
            ],
            "rfam_acc": "RF00003",
          },
        ],
      },
    }
  `);
});
