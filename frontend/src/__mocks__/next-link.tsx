import React from 'react';

export default function MockLink({ children, ...props }: any) {
  return <a {...props}>{children}</a>;
}
