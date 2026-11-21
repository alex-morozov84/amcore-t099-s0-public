import { escapeLikeLiteral } from '@amcore/shared'

describe('New S0 API suite discovery', () => {
  it('preserves search text while escaping literal LIKE metacharacters', () => {
    expect(escapeLikeLiteral('50%_off\\deal')).toBe('50\\%\\_off\\\\deal')
  })
})
