import { CREATE_PRODUCT } from '@/graphql/mutations';
import { PRODUCTS } from '@/graphql/queries';
import type { CreateProductMutationVariables } from '@/__generated__/graphql';
import { useMutation } from '@apollo/client';

export const useAddProduct = () => {
  // `refetchQueries: [PRODUCTS]` is the simplest way to keep the catalog in
  // sync after a successful create — no manual cache surgery required and the
  // typed Document means the gateway can never disagree with what we ask for.
  const [createProduct, { loading: saving, error, reset }] = useMutation(CREATE_PRODUCT, {
    refetchQueries: [PRODUCTS],
    awaitRefetchQueries: true,
  });

  const addProduct = async (input: CreateProductMutationVariables) => {
    const result = await createProduct({ variables: input });
    return result.data?.createProduct ?? null;
  };

  return { addProduct, saving, error, reset };
};
