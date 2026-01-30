import { FieldNode, Kind, SelectionNode, SelectionSetNode } from 'graphql';

// Only deduplicates field nodes, it doesn't do nested merges
export class SelectionSetBuilder {
  private otherSelections = new Set<SelectionNode>();
  private nonAliasedFieldNodes = new Map<string, FieldNode>();
  private seenSelections = new WeakSet<SelectionNode>();

  addFieldNode(fieldNode: FieldNode) {
    if (fieldNode.alias == null) {
      const existingFieldNode = this.nonAliasedFieldNodes.get(
        fieldNode.name.value,
      );
      if (existingFieldNode == null) {
        this.nonAliasedFieldNodes.set(fieldNode.name.value, fieldNode);
      } else {
        if (existingFieldNode.selectionSet && fieldNode.selectionSet) {
          const builder = new SelectionSetBuilder();
          for (const selection of existingFieldNode.selectionSet.selections) {
            builder.add(selection);
          }
          for (const selection of fieldNode.selectionSet.selections) {
            builder.add(selection);
          }
          const mergedSelectionSet = builder.build();
          this.nonAliasedFieldNodes.set(fieldNode.name.value, {
            ...existingFieldNode,
            selectionSet: mergedSelectionSet,
          });
        }
      }
    } else {
      this.otherSelections.add(fieldNode);
    }
  }

  add(selection: SelectionNode) {
    if (this.seenSelections.has(selection)) {
      return;
    }
    this.seenSelections.add(selection);
    if (selection.kind === Kind.FIELD) {
      this.addFieldNode(selection);
    } else {
      this.otherSelections.add(selection);
    }
  }

  build(): SelectionSetNode {
    const selections: SelectionNode[] = [];
    for (const fieldNode of this.nonAliasedFieldNodes.values()) {
      selections.push(fieldNode);
    }
    for (const selection of this.otherSelections) {
      selections.push(selection);
    }
    return { kind: Kind.SELECTION_SET, selections };
  }
}
